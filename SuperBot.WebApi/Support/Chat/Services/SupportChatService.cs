using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.WebApi.Support.Chat.Dto;
using SuperBot.WebApi.Support.Chat.Models;
using SuperBot.WebApi.Support.Infrastructure;

namespace SuperBot.WebApi.Support.Chat.Services;

public interface ISupportChatService
{
    Task<CreateChatSessionResponse> CreateSessionAsync(SupportUserContext? user, CreateChatSessionRequest request);
    Task<ChatSessionDetailDto> GetSessionAsync(string sessionId, int messageLimit);
    Task<AddChatMessageResponse> AddUserMessageAsync(string sessionId, SupportUserContext? user, string text);
    Task<IReadOnlyList<ChatMessageDto>> GetMessagesAsync(string sessionId, DateTime? after);
    Task<ChatConfigDto> GetConfigAsync();
    Task<ChatSessionListResponse> ListSessionsAsync(string? status, string? query, int page, int pageSize);
    Task<ChatSessionDetailDto> GetSessionForAdminAsync(string sessionId, int messageLimit);
    Task<ChatSessionDto> AssignSessionAsync(string sessionId, SupportUserContext agent);
    Task<ChatSessionDto> UpdateSessionAsync(string sessionId, UpdateChatSessionRequest request);
    Task<ChatMessageDto> AddAgentMessageAsync(string sessionId, SupportUserContext agent, string text);
    Task<ChatMessageDto?> StreamAssistantResponseAsync(
        string sessionId,
        SupportUserContext? user,
        string text,
        Func<string, Task> onChunk,
        CancellationToken cancellationToken);
}

public class SupportChatService : ISupportChatService
{
    private const string SystemPrompt = """
        You are Tale Shop Support Assistant.
        Style: friendly, professional, concise. Provide concrete next steps.
        Be helpful and commercial but honest: recommend editions or purchases only when relevant.
        Never invent policies, pricing, or availability. If unsure, ask or offer a human agent.
        Always ask clarifying questions if the request is incomplete (order id, email, platform).
        If the user is angry, mentions refund disputes, chargebacks, legal issues, payment bugs,
        account compromise, or explicitly asks for a human, initiate handoff_to_human.
        """;

    private static readonly string[] EscalationKeywords =
    {
        "refund", "chargeback", "payment failed", "payment error", "hacked", "stolen",
        "angry", "fraud", "legal", "dispute", "scam", "human", "operator", "manager"
    };

    private static readonly string[] EscalationPhrases =
    {
        "i don't know", "i do not know", "can't help", "cannot help"
    };

    private readonly IMongoCollection<ChatSession> _sessions;
    private readonly IMongoCollection<ChatMessage> _messages;
    private readonly SupportChatOptions _options;
    private readonly IMemoryCache _cache;
    private readonly IOllamaChatClient _ollamaClient;
    private readonly ILogger<SupportChatService> _logger;

    public SupportChatService(
        IMongoDatabase database,
        IOptions<SupportChatOptions> options,
        IMemoryCache cache,
        IOllamaChatClient ollamaClient,
        ILogger<SupportChatService> logger)
    {
        _sessions = database.GetCollection<ChatSession>("SupportChatSessions");
        _messages = database.GetCollection<ChatMessage>("SupportChatMessages");
        _options = options.Value;
        _cache = cache;
        _ollamaClient = ollamaClient;
        _logger = logger;
    }

    public Task<ChatConfigDto> GetConfigAsync()
    {
        return Task.FromResult(new ChatConfigDto { StreamingEnabled = _options.StreamingEnabled });
    }

    public async Task<CreateChatSessionResponse> CreateSessionAsync(SupportUserContext? user, CreateChatSessionRequest request)
    {
        var now = DateTime.UtcNow;
        var session = new ChatSession
        {
            CreatedAt = now,
            UpdatedAt = now,
            UserId = string.IsNullOrWhiteSpace(user?.UserId) ? null : user!.UserId,
            Email = request.Email ?? (string.IsNullOrWhiteSpace(user?.Email) ? null : user!.Email),
            OrderId = request.OrderId,
            Locale = request.Locale,
            Status = ChatSessionStatus.Ai,
            LastMessageAt = null,
            Priority = ChatPriority.Normal
        };

        await _sessions.InsertOneAsync(session);

        return new CreateChatSessionResponse
        {
            SessionId = session.Id,
            Status = FormatStatus(session.Status)
        };
    }

    public async Task<ChatSessionDetailDto> GetSessionAsync(string sessionId, int messageLimit)
    {
        var session = await GetSessionEntityAsync(sessionId);
        if (session.Status == ChatSessionStatus.Closed)
        {
            throw new SupportChatRequestException("This chat session is closed.", StatusCodes.Status409Conflict);
        }
        var messages = await GetMessagesInternalAsync(session.Id, messageLimit);
        return new ChatSessionDetailDto
        {
            Session = MapSession(session),
            Messages = messages.Select(MapMessage).ToList()
        };
    }

    public async Task<ChatSessionListResponse> ListSessionsAsync(string? status, string? query, int page, int pageSize)
    {
        var safePage = Math.Max(page, 1);
        var safePageSize = Math.Clamp(pageSize, 1, 50);
        var filter = Builders<ChatSession>.Filter.Empty;

        if (!string.IsNullOrWhiteSpace(status) && TryParseStatus(status, out var parsed))
        {
            filter &= Builders<ChatSession>.Filter.Eq(s => s.Status, parsed);
        }

        if (!string.IsNullOrWhiteSpace(query))
        {
            var regex = new BsonRegularExpression(query, "i");
            filter &= Builders<ChatSession>.Filter.Or(
                Builders<ChatSession>.Filter.Regex(s => s.Email, regex),
                Builders<ChatSession>.Filter.Regex(s => s.UserId, regex));
        }

        var total = await _sessions.CountDocumentsAsync(filter);
        var items = await _sessions
            .Find(filter)
            .SortByDescending(s => s.LastMessageAt)
            .Skip((safePage - 1) * safePageSize)
            .Limit(safePageSize)
            .ToListAsync();

        var sessionIds = items.Select(i => i.Id).ToList();
        var latestMessages = await _messages
            .Find(m => sessionIds.Contains(m.SessionId))
            .SortByDescending(m => m.CreatedAt)
            .ToListAsync();

        var previewLookup = latestMessages
            .GroupBy(m => m.SessionId)
            .ToDictionary(g => g.Key, g => g.FirstOrDefault()?.Text);

        return new ChatSessionListResponse
        {
            Items = items.Select(item => new ChatSessionSummaryDto
            {
                Id = item.Id,
                Status = FormatStatus(item.Status),
                UserId = item.UserId,
                Email = item.Email,
                AssignedAgentName = item.AssignedAgentName,
                LastMessageAt = item.LastMessageAt,
                LastMessagePreview = previewLookup.TryGetValue(item.Id, out var preview) ? preview : null,
                Tags = item.Tags,
                Priority = item.Priority.ToString().ToLowerInvariant()
            }).ToList(),
            Page = safePage,
            PageSize = safePageSize,
            Total = total
        };
    }

    public Task<ChatSessionDetailDto> GetSessionForAdminAsync(string sessionId, int messageLimit)
    {
        return GetSessionAsync(sessionId, messageLimit);
    }

    public async Task<IReadOnlyList<ChatMessageDto>> GetMessagesAsync(string sessionId, DateTime? after)
    {
        var session = await GetSessionEntityAsync(sessionId);
        if (session.Status == ChatSessionStatus.Closed)
        {
            throw new SupportChatRequestException("This chat session is closed.", StatusCodes.Status409Conflict);
        }
        var filter = Builders<ChatMessage>.Filter.Eq(m => m.SessionId, session.Id);
        if (after.HasValue)
        {
            filter &= Builders<ChatMessage>.Filter.Gt(m => m.CreatedAt, after.Value);
        }

        var items = await _messages.Find(filter).SortBy(m => m.CreatedAt).ToListAsync();
        return items.Select(MapMessage).ToList();
    }

    public async Task<AddChatMessageResponse> AddUserMessageAsync(string sessionId, SupportUserContext? user, string text)
    {
        var sanitized = SanitizeText(text);
        ValidateText(sanitized);
        EnsureRateLimit(sessionId);

        var session = await GetSessionEntityAsync(sessionId);
        var now = DateTime.UtcNow;
        var userMessage = new ChatMessage
        {
            SessionId = session.Id,
            Role = ChatMessageRole.User,
            AuthorName = user?.DisplayName ?? "You",
            Text = sanitized,
            CreatedAt = now
        };
        await _messages.InsertOneAsync(userMessage);

        await UpdateSessionActivityAsync(session, now);

        if (session.Status == ChatSessionStatus.Assigned || session.Status == ChatSessionStatus.NeedsAgent)
        {
            return new AddChatMessageResponse
            {
                Session = MapSession(session),
                AssistantMessage = null
            };
        }

        var (assistantMessage, updatedSession) = await GenerateAssistantReplyAsync(session, sanitized, cancellationToken: CancellationToken.None);
        return new AddChatMessageResponse
        {
            Session = MapSession(updatedSession),
            AssistantMessage = assistantMessage == null ? null : MapMessage(assistantMessage)
        };
    }

    public async Task<ChatMessageDto?> StreamAssistantResponseAsync(
        string sessionId,
        SupportUserContext? user,
        string text,
        Func<string, Task> onChunk,
        CancellationToken cancellationToken)
    {
        var sanitized = SanitizeText(text);
        ValidateText(sanitized);
        EnsureRateLimit(sessionId);

        var session = await GetSessionEntityAsync(sessionId);
        var now = DateTime.UtcNow;
        var userMessage = new ChatMessage
        {
            SessionId = session.Id,
            Role = ChatMessageRole.User,
            AuthorName = user?.DisplayName ?? "You",
            Text = sanitized,
            CreatedAt = now
        };
        await _messages.InsertOneAsync(userMessage);
        await UpdateSessionActivityAsync(session, now);

        if (session.Status == ChatSessionStatus.Assigned || session.Status == ChatSessionStatus.NeedsAgent)
        {
            return null;
        }

        var history = await BuildHistoryAsync(session.Id);
        var request = BuildOllamaRequest(history, stream: true);

        var toolCallArguments = string.Empty;
        var responseBuilder = new System.Text.StringBuilder();

        try
        {
            await _ollamaClient.StreamChatAsync(request, async chunk =>
            {
                var content = chunk.Message?.Content ?? string.Empty;
                if (!string.IsNullOrWhiteSpace(content))
                {
                    responseBuilder.Append(content);
                    await onChunk(content);
                }

                var toolCall = chunk.Message?.ToolCalls?.FirstOrDefault();
                if (toolCall?.Function?.Name == "handoff_to_human")
                {
                    toolCallArguments = toolCall.Function.Arguments;
                }
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Streaming from Ollama failed.");
            var fallback = "I'm having trouble reaching our AI systems right now. I can connect you with a human agent or create a ticket.";
            await onChunk(fallback);
            responseBuilder.Clear();
            responseBuilder.Append(fallback);
        }

        var assistantText = responseBuilder.ToString().Trim();
        var escalation = EvaluateEscalation(sanitized, assistantText, toolCallArguments);
        if (escalation.ShouldEscalate)
        {
            var escalationMessage = await HandleEscalationAsync(session, escalation.Reason, toolCallArguments);
            return MapMessage(escalationMessage);
        }

        if (string.IsNullOrWhiteSpace(assistantText))
        {
            assistantText = "I want to make sure I help with the right details. Could you share your order ID or account email?";
        }

        var assistantMessage = await SaveAssistantMessageAsync(session, assistantText);
        return MapMessage(assistantMessage);
    }

    public async Task<ChatSessionDto> AssignSessionAsync(string sessionId, SupportUserContext agent)
    {
        var session = await GetSessionEntityAsync(sessionId);
        session.Status = ChatSessionStatus.Assigned;
        session.AssignedAgentId = agent.UserId;
        session.AssignedAgentName = agent.DisplayName;
        session.UpdatedAt = DateTime.UtcNow;

        var update = Builders<ChatSession>.Update
            .Set(s => s.Status, session.Status)
            .Set(s => s.AssignedAgentId, session.AssignedAgentId)
            .Set(s => s.AssignedAgentName, session.AssignedAgentName)
            .Set(s => s.UpdatedAt, session.UpdatedAt);

        await _sessions.UpdateOneAsync(s => s.Id == session.Id, update);
        return MapSession(session);
    }

    public async Task<ChatSessionDto> UpdateSessionAsync(string sessionId, UpdateChatSessionRequest request)
    {
        var session = await GetSessionEntityAsync(sessionId);
        var update = Builders<ChatSession>.Update;
        var updates = new List<UpdateDefinition<ChatSession>>();

        if (!string.IsNullOrWhiteSpace(request.Status) &&
            TryParseStatus(request.Status, out var status))
        {
            session.Status = status;
            updates.Add(update.Set(s => s.Status, status));
        }

        if (!string.IsNullOrWhiteSpace(request.Priority) &&
            Enum.TryParse<ChatPriority>(request.Priority, true, out var priority))
        {
            session.Priority = priority;
            updates.Add(update.Set(s => s.Priority, priority));
        }

        if (!string.IsNullOrWhiteSpace(request.Tag))
        {
            if (!session.Tags.Contains(request.Tag, StringComparer.OrdinalIgnoreCase))
            {
                session.Tags.Add(request.Tag);
                updates.Add(update.AddToSet(s => s.Tags, request.Tag));
            }
        }

        session.UpdatedAt = DateTime.UtcNow;
        updates.Add(update.Set(s => s.UpdatedAt, session.UpdatedAt));

        if (updates.Count > 0)
        {
            await _sessions.UpdateOneAsync(s => s.Id == session.Id, update.Combine(updates));
        }

        return MapSession(session);
    }

    public async Task<ChatMessageDto> AddAgentMessageAsync(string sessionId, SupportUserContext agent, string text)
    {
        var sanitized = SanitizeText(text);
        ValidateText(sanitized);
        var session = await GetSessionEntityAsync(sessionId);

        var now = DateTime.UtcNow;
        var message = new ChatMessage
        {
            SessionId = session.Id,
            Role = ChatMessageRole.Agent,
            AuthorName = agent.DisplayName,
            Text = sanitized,
            CreatedAt = now
        };

        await _messages.InsertOneAsync(message);
        await UpdateSessionActivityAsync(session, now);
        session.Status = ChatSessionStatus.Assigned;
        session.AssignedAgentId = agent.UserId;
        session.AssignedAgentName = agent.DisplayName;

        var update = Builders<ChatSession>.Update
            .Set(s => s.Status, session.Status)
            .Set(s => s.AssignedAgentId, session.AssignedAgentId)
            .Set(s => s.AssignedAgentName, session.AssignedAgentName);
        await _sessions.UpdateOneAsync(s => s.Id == session.Id, update);

        return MapMessage(message);
    }

    private async Task<(ChatMessage? AssistantMessage, ChatSession Session)> GenerateAssistantReplyAsync(
        ChatSession session,
        string userText,
        CancellationToken cancellationToken)
    {
        var history = await BuildHistoryAsync(session.Id);
        var request = BuildOllamaRequest(history, stream: false);

        try
        {
            using var timeoutSource = new CancellationTokenSource(TimeSpan.FromSeconds(_options.LlmTimeoutSeconds));
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(timeoutSource.Token, cancellationToken);
            var response = await _ollamaClient.ChatAsync(request, linked.Token);
            var assistantText = response.Message?.Content?.Trim() ?? string.Empty;
            var toolCallArguments = response.Message?.ToolCalls?.FirstOrDefault()?.Function?.Arguments ?? string.Empty;

            if (string.IsNullOrWhiteSpace(assistantText) && string.IsNullOrWhiteSpace(toolCallArguments))
            {
                assistantText = "I want to make sure I help with the right details. Could you share your order ID or account email?";
            }

            var escalation = EvaluateEscalation(userText, assistantText, toolCallArguments);
            if (escalation.ShouldEscalate)
            {
                var escalationMessage = await HandleEscalationAsync(session, escalation.Reason, toolCallArguments);
                return (escalationMessage, session);
            }

            var assistantMessage = await SaveAssistantMessageAsync(session, assistantText);
            return (assistantMessage, session);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Ollama chat failed.");
            var fallbackText = "I'm having trouble reaching our AI systems right now. I can connect you with a human agent or create a ticket.";
            var assistantMessage = await SaveAssistantMessageAsync(session, fallbackText);
            return (assistantMessage, session);
        }
    }

    private async Task<ChatMessage> SaveAssistantMessageAsync(ChatSession session, string text)
    {
        var now = DateTime.UtcNow;
        var message = new ChatMessage
        {
            SessionId = session.Id,
            Role = ChatMessageRole.Assistant,
            AuthorName = "Tale Support (AI)",
            Text = text,
            CreatedAt = now,
            Metadata = new ChatMessageMetadata
            {
                Model = _options.OllamaModel
            }
        };

        await _messages.InsertOneAsync(message);
        await UpdateSessionActivityAsync(session, now);
        return message;
    }

    private async Task<ChatMessage> HandleEscalationAsync(ChatSession session, string reason, string toolCallArguments)
    {
        session.Status = ChatSessionStatus.NeedsAgent;
        session.EscalationReason = reason;
        session.UpdatedAt = DateTime.UtcNow;
        await _sessions.UpdateOneAsync(
            s => s.Id == session.Id,
            Builders<ChatSession>.Update
                .Set(s => s.Status, session.Status)
                .Set(s => s.EscalationReason, session.EscalationReason)
                .Set(s => s.UpdatedAt, session.UpdatedAt));

        var message = new ChatMessage
        {
            SessionId = session.Id,
            Role = ChatMessageRole.Assistant,
            AuthorName = "Tale Support (AI)",
            Text = "I’m bringing in a specialist to help. Please leave your email or order ID if you have it.",
            CreatedAt = DateTime.UtcNow,
            Metadata = new ChatMessageMetadata
            {
                EscalationReason = reason,
                ToolCall = toolCallArguments
            }
        };

        await _messages.InsertOneAsync(message);
        return message;
    }

    private async Task UpdateSessionActivityAsync(ChatSession session, DateTime timestamp)
    {
        session.UpdatedAt = timestamp;
        session.LastMessageAt = timestamp;

        var update = Builders<ChatSession>.Update
            .Set(s => s.UpdatedAt, timestamp)
            .Set(s => s.LastMessageAt, timestamp);

        await _sessions.UpdateOneAsync(s => s.Id == session.Id, update);
    }

    private async Task<List<OllamaChatMessage>> BuildHistoryAsync(string sessionId)
    {
        var history = new List<OllamaChatMessage>
        {
            new()
            {
                Role = "system",
                Content = SystemPrompt
            }
        };

        var recent = await _messages
            .Find(m => m.SessionId == sessionId)
            .SortByDescending(m => m.CreatedAt)
            .Limit(_options.HistoryLimit)
            .ToListAsync();

        foreach (var message in recent.OrderBy(m => m.CreatedAt))
        {
            history.Add(new OllamaChatMessage
            {
                Role = MapRole(message.Role),
                Content = message.Text
            });
        }

        return history;
    }

    private OllamaChatRequest BuildOllamaRequest(List<OllamaChatMessage> messages, bool stream)
    {
        return new OllamaChatRequest
        {
            Model = _options.OllamaModel,
            Messages = messages,
            Stream = stream,
            Tools = new List<OllamaToolDefinition>
            {
                new()
                {
                    Function = new OllamaFunctionDefinition
                    {
                        Name = "handoff_to_human",
                        Description = "Escalate the conversation to a live support agent.",
                        Parameters = new
                        {
                            type = "object",
                            properties = new
                            {
                                reason = new { type = "string" },
                                urgency = new { type = "string", @enum = new[] { "low", "normal", "high" } },
                                category = new { type = "string" },
                                suggestedQuestions = new { type = "array", items = new { type = "string" } }
                            },
                            required = new[] { "reason" }
                        }
                    }
                }
            }
        };
    }

    private string MapRole(ChatMessageRole role)
    {
        return role switch
        {
            ChatMessageRole.User => "user",
            ChatMessageRole.Assistant => "assistant",
            ChatMessageRole.Agent => "assistant",
            _ => "system"
        };
    }

    private async Task<ChatSession> GetSessionEntityAsync(string sessionId)
    {
        ChatSession? session = null;
        if (ObjectId.TryParse(sessionId, out _))
        {
            session = await _sessions.Find(s => s.Id == sessionId).FirstOrDefaultAsync();
        }

        if (session == null)
        {
            throw new SupportChatRequestException("Chat session not found.", StatusCodes.Status404NotFound);
        }

        return session;
    }

    private async Task<List<ChatMessage>> GetMessagesInternalAsync(string sessionId, int messageLimit)
    {
        var limit = Math.Clamp(messageLimit, 1, 100);
        return await _messages
            .Find(m => m.SessionId == sessionId)
            .SortBy(m => m.CreatedAt)
            .Limit(limit)
            .ToListAsync();
    }

    private ChatSessionDto MapSession(ChatSession session)
    {
        return new ChatSessionDto
        {
            Id = session.Id,
            CreatedAt = session.CreatedAt,
            UpdatedAt = session.UpdatedAt,
            UserId = session.UserId,
            Email = session.Email,
            Status = FormatStatus(session.Status),
            AssignedAgentId = session.AssignedAgentId,
            AssignedAgentName = session.AssignedAgentName,
            LastMessageAt = session.LastMessageAt,
            Tags = session.Tags,
            Priority = session.Priority.ToString().ToLowerInvariant()
        };
    }

    private ChatMessageDto MapMessage(ChatMessage message)
    {
        return new ChatMessageDto
        {
            Id = message.Id,
            SessionId = message.SessionId,
            Role = message.Role.ToString().ToLowerInvariant(),
            AuthorName = message.AuthorName,
            Text = message.Text,
            CreatedAt = message.CreatedAt,
            Metadata = new ChatMessageMetadataDto
            {
                Model = message.Metadata?.Model,
                Confidence = message.Metadata?.Confidence,
                EscalationReason = message.Metadata?.EscalationReason,
                ToolCall = message.Metadata?.ToolCall
            }
        };
    }

    private (bool ShouldEscalate, string Reason) EvaluateEscalation(string userText, string assistantText, string toolCallArguments)
    {
        if (!string.IsNullOrWhiteSpace(toolCallArguments))
        {
            return (true, "Tool call requested escalation.");
        }

        var combined = $"{userText} {assistantText}".ToLowerInvariant();
        if (EscalationKeywords.Any(keyword => combined.Contains(keyword, StringComparison.OrdinalIgnoreCase)))
        {
            return (true, "Detected escalation keyword.");
        }

        if (EscalationPhrases.Any(phrase => assistantText.Contains(phrase, StringComparison.OrdinalIgnoreCase)))
        {
            return (true, "Assistant response indicates uncertainty.");
        }

        return (false, string.Empty);
    }

    private void ValidateText(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            throw new SupportChatRequestException("Message is required.", StatusCodes.Status400BadRequest);
        }

        if (text.Length > _options.MessageMaxLength)
        {
            throw new SupportChatRequestException($"Message exceeds {_options.MessageMaxLength} characters.", StatusCodes.Status400BadRequest);
        }
    }

    private string SanitizeText(string text)
    {
        return text.Trim();
    }

    private void EnsureRateLimit(string sessionId)
    {
        var key = $"support_chat_rate_{sessionId}";
        if (_cache.TryGetValue<int>(key, out var count))
        {
            if (count >= _options.RateLimitPerMinute)
            {
                throw new SupportChatRequestException("Message rate limit reached. Please wait a moment.", StatusCodes.Status429TooManyRequests);
            }

            _cache.Set(key, count + 1, TimeSpan.FromMinutes(1));
            return;
        }

        _cache.Set(key, 1, TimeSpan.FromMinutes(1));
    }

    private string FormatStatus(ChatSessionStatus status)
    {
        return status switch
        {
            ChatSessionStatus.NeedsAgent => "needs_agent",
            _ => status.ToString().ToLowerInvariant()
        };
    }

    private bool TryParseStatus(string status, out ChatSessionStatus parsed)
    {
        var normalized = status.Replace("_", "", StringComparison.OrdinalIgnoreCase);
        if (normalized.Equals("needsagent", StringComparison.OrdinalIgnoreCase))
        {
            parsed = ChatSessionStatus.NeedsAgent;
            return true;
        }

        return Enum.TryParse(status, true, out parsed);
    }
}

public class SupportChatRequestException : Exception
{
    public int StatusCode { get; }

    public SupportChatRequestException(string message, int statusCode) : base(message)
    {
        StatusCode = statusCode;
    }
}
