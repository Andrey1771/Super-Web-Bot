using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
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
    Task<CreateChatSessionResponse> CreateSessionAsync(SupportUserContext? user, CreateChatSessionRequest request, string? clientIp);
    Task<ChatSessionDetailDto> GetSessionAsync(string sessionId, int messageLimit);
    Task<AddChatMessageResponse> AddUserMessageAsync(string sessionId, SupportUserContext? user, string text, string? clientIp);
    Task<IReadOnlyList<ChatMessageDto>> GetMessagesAsync(string sessionId, DateTime? after);
    Task<ChatConfigDto> GetConfigAsync();
    Task<ChatSessionDto> UpdateContactAsync(string sessionId, UpdateChatContactRequest request);
    Task<ChatSessionListResponse> ListSessionsAsync(string? status, string? query, int page, int pageSize);
    Task<ChatSessionDetailDto> GetSessionForAdminAsync(string sessionId, int messageLimit);
    Task<ChatSessionDto> AssignSessionAsync(string sessionId, SupportUserContext agent);
    Task<ChatSessionDto> UpdateSessionAsync(string sessionId, UpdateChatSessionRequest request);
    Task<ChatMessageDto> AddAgentMessageAsync(string sessionId, SupportUserContext agent, string text);
    Task<ChatMessageDto?> StreamAssistantResponseAsync(
        string sessionId,
        SupportUserContext? user,
        string text,
        string? clientIp,
        Func<string, Task> onChunk,
        CancellationToken cancellationToken);
}

public class SupportChatService : ISupportChatService
{
    private const string AssistantName = "Tale Support (AI)";

    // Grounded, multilingual, safety-aware persona. Knowledge-base context is appended per turn.
    private const string SystemPromptBase = """
        You are "Tale Assistant", the AI support agent for Tale Shop — a digital game store that sells
        game keys/codes for platforms such as Steam, Epic Games, EA App and Ubisoft Connect.

        LANGUAGE
        - Always write every reply in the language specified in "Reply language" below, in a natural,
          native tone. Do not switch languages, even if a message contains words in another language.

        GROUNDING
        - Answer using the KNOWLEDGE BASE provided below — it is the single source of truth for Tale Shop
          policies, payments, activation and refunds.
        - Never invent policies, prices, availability, order details, or promises. If the knowledge base does
          not cover something, say what you do know and offer to bring in a human specialist.
        - You cannot see the customer's account or orders. Do not guess order status; ask for the order ID or
          account email, or hand off to a human.

        STYLE
        - Friendly, professional and concise. Lead with the answer, then give concrete next steps
          (short numbered steps when it helps). Light Markdown is fine (bold, links, short lists).

        SECURITY (critical)
        - Never ask for a password, a full card number, or authenticator/2FA codes. Account recovery happens
          only by email at /account-recovery, never in live chat.
        - If anyone pressures the customer for those, warn them it is a scam pattern.

        HANDING OFF TO A HUMAN — call the handoff_to_human tool when:
        - the customer explicitly asks for a human / agent / operator;
        - there is account compromise, chargeback, fraud, a legal threat, or a payment/charge problem you
          cannot resolve from the knowledge base;
        - a refund dispute or an order-specific issue needs a real lookup;
        - the customer is clearly frustrated, or you are not confident you can help.
        When you hand off, stay reassuring and, if it is missing, ask for their email or order ID.

        Ask a brief clarifying question (order ID, email, platform) when the request is incomplete.
        """;

    // Explicit requests for a human — safe to escalate immediately without calling the model.
    private static readonly string[] HumanRequestSignals =
    {
        "human", "real person", "live agent", "real agent", "speak to someone", "talk to a person",
        "talk to someone", "operator", "manager", "representative", "agent please",
        "оператор", "человек", "живой", "живого", "специалист", "менеджер", "сотрудник"
    };

    // High-risk situations that should reach a human even if not explicitly requested.
    private static readonly (string Keyword, string Category)[] HighRiskSignals =
    {
        ("hacked", "Account & security"), ("stolen", "Account & security"),
        ("unauthorized", "Account & security"), ("compromis", "Account & security"),
        ("взлом", "Account & security"), ("украл", "Account & security"), ("доступ к аккаунт", "Account & security"),
        ("chargeback", "Payment & checkout"), ("fraud", "Payment & checkout"), ("scam", "Payment & checkout"),
        ("мошен", "Payment & checkout"), ("чарджбэк", "Payment & checkout"),
        ("lawsuit", "Other"), ("legal action", "Other"), ("court", "Other"),
        ("суд", "Other"), ("полиц", "Other")
    };

    // Lightweight category inference from the customer's words (mirrors the support taxonomy).
    private static readonly (string[] Keywords, string Category)[] CategoryRules =
    {
        (new[] { "refund", "money back", "возврат", "вернуть деньги" }, "Refund request"),
        (new[] { "payment", "card", "pay ", "declined", "оплат", "карта", "платеж" }, "Payment & checkout"),
        (new[] { "activate", "redeem", "key", "code", "region", "актив", "ключ", "код", "регион" }, "Key delivery / activation"),
        (new[] { "order", "delivery", "delivered", "заказ", "доставк" }, "Order status"),
        (new[] { "account", "login", "2fa", "password", "аккаунт", "вход", "пароль" }, "Account & security"),
        (new[] { "bug", "error", "crash", "not working", "ошибк", "баг", "не работает" }, "Technical issue / bug"),
    };

    private readonly IMongoCollection<ChatSession> _sessions;
    private readonly IMongoCollection<ChatMessage> _messages;
    private readonly SupportChatOptions _options;
    private readonly IMemoryCache _cache;
    private readonly IOllamaChatClient _ollamaClient;
    private readonly ISupportKnowledgeBase _knowledgeBase;
    private readonly ISupportNotificationService _notifications;
    private readonly ILlmConcurrencyLimiter _llmLimiter;
    private readonly ITurnstileVerifier _turnstile;
    private readonly ILogger<SupportChatService> _logger;

    private static readonly JsonSerializerOptions ToolArgsJsonOptions = new(JsonSerializerDefaults.Web);

    public SupportChatService(
        IMongoDatabase database,
        IOptions<SupportChatOptions> options,
        IMemoryCache cache,
        IOllamaChatClient ollamaClient,
        ISupportKnowledgeBase knowledgeBase,
        ISupportNotificationService notifications,
        ILlmConcurrencyLimiter llmLimiter,
        ITurnstileVerifier turnstile,
        ILogger<SupportChatService> logger)
    {
        _sessions = database.GetCollection<ChatSession>("SupportChatSessions");
        _messages = database.GetCollection<ChatMessage>("SupportChatMessages");
        _options = options.Value;
        _cache = cache;
        _ollamaClient = ollamaClient;
        _knowledgeBase = knowledgeBase;
        _notifications = notifications;
        _llmLimiter = llmLimiter;
        _turnstile = turnstile;
        _logger = logger;
    }

    public Task<ChatConfigDto> GetConfigAsync()
    {
        return Task.FromResult(new ChatConfigDto
        {
            StreamingEnabled = _options.StreamingEnabled,
            TurnstileSiteKey = _options.TurnstileSiteKey
        });
    }

    public async Task<CreateChatSessionResponse> CreateSessionAsync(SupportUserContext? user, CreateChatSessionRequest request, string? clientIp)
    {
        EnsureIpSessionLimit(clientIp);

        if (!await _turnstile.VerifyAsync(request.TurnstileToken, clientIp, CancellationToken.None))
        {
            throw new SupportChatRequestException(
                "We couldn't verify that you're human. Please refresh and try again.",
                StatusCodes.Status403Forbidden);
        }

        var now = DateTime.UtcNow;
        var session = new ChatSession
        {
            CreatedAt = now,
            UpdatedAt = now,
            UserId = string.IsNullOrWhiteSpace(user?.UserId) ? null : user!.UserId,
            Email = request.Email ?? (string.IsNullOrWhiteSpace(user?.Email) ? null : user!.Email),
            OrderId = request.OrderId,
            Locale = request.Locale,
            Language = NormalizeLocale(request.Locale),
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

    public async Task<ChatSessionDto> UpdateContactAsync(string sessionId, UpdateChatContactRequest request)
    {
        var session = await GetSessionEntityAsync(sessionId);
        var updates = new List<UpdateDefinition<ChatSession>>();
        var builder = Builders<ChatSession>.Update;

        if (!string.IsNullOrWhiteSpace(request.Email))
        {
            session.Email = request.Email.Trim();
            updates.Add(builder.Set(s => s.Email, session.Email));
        }

        if (!string.IsNullOrWhiteSpace(request.OrderId))
        {
            session.OrderId = request.OrderId.Trim();
            updates.Add(builder.Set(s => s.OrderId, session.OrderId));
        }

        if (updates.Count > 0)
        {
            session.UpdatedAt = DateTime.UtcNow;
            updates.Add(builder.Set(s => s.UpdatedAt, session.UpdatedAt));
            await _sessions.UpdateOneAsync(s => s.Id == session.Id, builder.Combine(updates));
        }

        return MapSession(session);
    }

    public async Task<AddChatMessageResponse> AddUserMessageAsync(string sessionId, SupportUserContext? user, string text, string? clientIp)
    {
        var sanitized = SanitizeText(text);
        ValidateText(sanitized);
        EnsureRateLimit(sessionId);
        EnsureIpMessageLimit(clientIp);

        var session = await GetSessionEntityAsync(sessionId);
        await EnsureSessionMessageCapAsync(session);
        var now = DateTime.UtcNow;
        await InsertUserMessageAsync(session, user, sanitized, now);

        if (IsHumanHandlingSession(session))
        {
            return new AddChatMessageResponse { Session = MapSession(session), AssistantMessage = null };
        }

        // Explicit "I want a human" / high-risk — skip the model and hand off directly.
        var pre = EvaluatePreEscalation(sanitized);
        if (pre.ShouldEscalate)
        {
            var handoff = await HandleEscalationAsync(session, sanitized, pre.Reason, pre.Category, pre.Priority, null);
            return new AddChatMessageResponse { Session = MapSession(session), AssistantMessage = MapMessage(handoff) };
        }

        var (assistantMessage, updatedSession) = await GenerateAssistantReplyAsync(session, sanitized, CancellationToken.None);
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
        string? clientIp,
        Func<string, Task> onChunk,
        CancellationToken cancellationToken)
    {
        var sanitized = SanitizeText(text);
        ValidateText(sanitized);
        EnsureRateLimit(sessionId);
        EnsureIpMessageLimit(clientIp);

        var session = await GetSessionEntityAsync(sessionId);
        await EnsureSessionMessageCapAsync(session);
        var now = DateTime.UtcNow;
        await InsertUserMessageAsync(session, user, sanitized, now);

        if (IsHumanHandlingSession(session))
        {
            return null;
        }

        // Explicit human request / high-risk: hand off before streaming anything to avoid an
        // "answer, then handoff" glitch.
        var pre = EvaluatePreEscalation(sanitized);
        if (pre.ShouldEscalate)
        {
            var handoff = await HandleEscalationAsync(session, sanitized, pre.Reason, pre.Category, pre.Priority, null);
            await onChunk(handoff.Text);
            return MapMessage(handoff);
        }

        var streamLease = await _llmLimiter.TryAcquireAsync(cancellationToken);
        if (streamLease == null)
        {
            var busyText = BusyMessage(session.Language);
            await onChunk(busyText);
            var busyMessage = await SaveAssistantMessageAsync(session, busyText);
            return MapMessage(busyMessage);
        }

        var history = await BuildHistoryAsync(session.Id, sanitized, session.Language);
        var request = BuildOllamaRequest(history, stream: true);

        var toolCallArguments = string.Empty;
        var filter = ReasoningFilter.CreateStreamFilter();
        var responseBuilder = new StringBuilder();

        try
        {
            await _ollamaClient.StreamChatAsync(request, async chunk =>
            {
                var content = chunk.Message?.Content ?? string.Empty;
                if (!string.IsNullOrEmpty(content))
                {
                    var visible = filter.Push(content);
                    if (!string.IsNullOrEmpty(visible))
                    {
                        responseBuilder.Append(visible);
                        await onChunk(visible);
                    }
                }

                var toolCall = chunk.Message?.ToolCalls?.FirstOrDefault(t => t.Function.Name == "handoff_to_human");
                if (toolCall != null)
                {
                    toolCallArguments = toolCall.Function.ArgumentsJson;
                }
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Streaming from Ollama failed.");
            var fallback = LocalizedText(session.Language,
                "I couldn't reach our AI just now. I can connect you with a human specialist — would you like that?",
                "Не удалось связаться с ИИ. Могу подключить живого специалиста — подключить?");
            await onChunk(fallback);
            responseBuilder.Clear();
            responseBuilder.Append(fallback);
        }
        finally
        {
            streamLease.Dispose();
        }

        // Model-driven handoff (tool call) — replace the (usually empty) stream with a handoff message.
        if (!string.IsNullOrWhiteSpace(toolCallArguments))
        {
            var args = ParseHandoffArgs(toolCallArguments);
            var handoff = await HandleEscalationAsync(
                session, sanitized, args.Reason ?? "Assistant requested a specialist.",
                args.Category, MapUrgency(args.Urgency, highRisk: false), args.Summary);
            await onChunk("\n\n" + handoff.Text);
            return MapMessage(handoff);
        }

        var assistantText = responseBuilder.ToString().Trim();
        if (string.IsNullOrWhiteSpace(assistantText))
        {
            assistantText = ClarifyPrompt(session.Language);
            await onChunk(assistantText);
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

    private async Task InsertUserMessageAsync(ChatSession session, SupportUserContext? user, string text, DateTime now)
    {
        var userMessage = new ChatMessage
        {
            SessionId = session.Id,
            Role = ChatMessageRole.User,
            AuthorName = user?.DisplayName ?? "You",
            Text = text,
            CreatedAt = now
        };
        await _messages.InsertOneAsync(userMessage);
        await UpdateSessionActivityAsync(session, now);
        // Language for UI/canned strings comes from the browser locale set at session creation
        // (the standard signal). The AI reply language is handled by the LLM, which mirrors the
        // language of the customer's message — so we don't re-detect it per message here.
    }

    private static bool IsHumanHandlingSession(ChatSession session) =>
        session.Status is ChatSessionStatus.Assigned or ChatSessionStatus.NeedsAgent;

    private async Task<(ChatMessage? AssistantMessage, ChatSession Session)> GenerateAssistantReplyAsync(
        ChatSession session,
        string userText,
        CancellationToken cancellationToken)
    {
        var history = await BuildHistoryAsync(session.Id, userText, session.Language);
        var request = BuildOllamaRequest(history, stream: false);

        var lease = await _llmLimiter.TryAcquireAsync(cancellationToken);
        if (lease == null)
        {
            var busy = await SaveAssistantMessageAsync(session, BusyMessage(session.Language));
            return (busy, session);
        }

        try
        {
            using var timeoutSource = new CancellationTokenSource(TimeSpan.FromSeconds(_options.LlmTimeoutSeconds));
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(timeoutSource.Token, cancellationToken);
            var response = await _ollamaClient.ChatAsync(request, linked.Token);

            var assistantText = ReasoningFilter.Strip(response.Message?.Content ?? string.Empty).Trim();
            var toolCall = response.Message?.ToolCalls?.FirstOrDefault(t => t.Function.Name == "handoff_to_human");
            var toolCallArguments = toolCall?.Function.ArgumentsJson ?? string.Empty;

            if (!string.IsNullOrWhiteSpace(toolCallArguments))
            {
                var args = ParseHandoffArgs(toolCallArguments);
                var handoff = await HandleEscalationAsync(
                    session, userText, args.Reason ?? "Assistant requested a specialist.",
                    args.Category, MapUrgency(args.Urgency, highRisk: false), args.Summary);
                return (handoff, session);
            }

            if (string.IsNullOrWhiteSpace(assistantText))
            {
                assistantText = ClarifyPrompt(session.Language);
            }

            var assistantMessage = await SaveAssistantMessageAsync(session, assistantText);
            return (assistantMessage, session);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Ollama chat failed.");
            var fallbackText = LocalizedText(session.Language,
                "I couldn't reach our AI just now. I can connect you with a human specialist — would you like that?",
                "Не удалось связаться с ИИ. Могу подключить живого специалиста — подключить?");
            var assistantMessage = await SaveAssistantMessageAsync(session, fallbackText);
            return (assistantMessage, session);
        }
        finally
        {
            lease.Dispose();
        }
    }

    private async Task<ChatMessage> SaveAssistantMessageAsync(ChatSession session, string text)
    {
        var now = DateTime.UtcNow;
        var message = new ChatMessage
        {
            SessionId = session.Id,
            Role = ChatMessageRole.Assistant,
            AuthorName = AssistantName,
            Text = text,
            CreatedAt = now,
            Metadata = new ChatMessageMetadata { Model = _options.OllamaModel }
        };

        await _messages.InsertOneAsync(message);
        await UpdateSessionActivityAsync(session, now);
        return message;
    }

    private async Task<ChatMessage> HandleEscalationAsync(
        ChatSession session,
        string userText,
        string reason,
        string? category,
        ChatPriority priority,
        string? providedSummary)
    {
        var resolvedCategory = category ?? InferCategory(userText) ?? "Other";
        var summary = string.IsNullOrWhiteSpace(providedSummary)
            ? await BuildConversationSummaryAsync(session, reason)
            : providedSummary!.Trim();

        session.Status = ChatSessionStatus.NeedsAgent;
        session.EscalationReason = reason;
        session.Category = resolvedCategory;
        session.Priority = priority;
        session.Summary = summary;
        session.UpdatedAt = DateTime.UtcNow;

        await _sessions.UpdateOneAsync(
            s => s.Id == session.Id,
            Builders<ChatSession>.Update
                .Set(s => s.Status, session.Status)
                .Set(s => s.EscalationReason, session.EscalationReason)
                .Set(s => s.Category, session.Category)
                .Set(s => s.Priority, session.Priority)
                .Set(s => s.Summary, session.Summary)
                .Set(s => s.UpdatedAt, session.UpdatedAt));

        var needsContact = string.IsNullOrWhiteSpace(session.Email) && string.IsNullOrWhiteSpace(session.OrderId);
        var text = BuildHandoffMessage(session.Language, needsContact);

        var message = new ChatMessage
        {
            SessionId = session.Id,
            Role = ChatMessageRole.Assistant,
            AuthorName = AssistantName,
            Text = text,
            CreatedAt = DateTime.UtcNow,
            Metadata = new ChatMessageMetadata
            {
                Model = _options.OllamaModel,
                EscalationReason = reason,
                Handoff = true
            }
        };

        await _messages.InsertOneAsync(message);
        await UpdateSessionActivityAsync(session, message.CreatedAt);

        // Best-effort alert to the specialist (never blocks the customer-facing handoff).
        try
        {
            await _notifications.NotifyEscalationAsync(session, summary, CancellationToken.None);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Escalation notification failed for session {SessionId}", session.Id);
        }

        return message;
    }

    private async Task<string> BuildConversationSummaryAsync(ChatSession session, string reason)
    {
        var recent = await _messages
            .Find(m => m.SessionId == session.Id)
            .SortByDescending(m => m.CreatedAt)
            .Limit(12)
            .ToListAsync();

        var builder = new StringBuilder();
        builder.AppendLine($"Escalation reason: {reason}");
        builder.AppendLine("Recent conversation:");
        foreach (var message in recent.OrderBy(m => m.CreatedAt))
        {
            var speaker = message.Role switch
            {
                ChatMessageRole.User => "Customer",
                ChatMessageRole.Assistant => "AI",
                ChatMessageRole.Agent => "Agent",
                _ => "System"
            };
            builder.AppendLine($"- {speaker}: {Shorten(message.Text, 220)}");
        }

        return builder.ToString().TrimEnd();
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

    private async Task<List<OllamaChatMessage>> BuildHistoryAsync(string sessionId, string latestUserText, string? language)
    {
        var context = _knowledgeBase.BuildContextBlock(latestUserText, _options.KnowledgeArticles);
        // Explicit, deterministic reply language driven by the site locale (not model guesswork).
        var languageDirective = $"Reply language: {LanguageName(language)}.";
        var systemContent = string.IsNullOrEmpty(context)
            ? $"{SystemPromptBase}\n\n{languageDirective}"
            : $"{SystemPromptBase}\n\n{languageDirective}\n\n{context}";

        var history = new List<OllamaChatMessage>
        {
            new() { Role = "system", Content = systemContent }
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
            Options = new Dictionary<string, object> { ["temperature"] = _options.Temperature },
            Tools = new List<OllamaToolDefinition>
            {
                new()
                {
                    Function = new OllamaFunctionDefinition
                    {
                        Name = "handoff_to_human",
                        Description = "Escalate the conversation to a live human support specialist.",
                        Parameters = new
                        {
                            type = "object",
                            properties = new
                            {
                                reason = new { type = "string", description = "Why a human is needed." },
                                category = new
                                {
                                    type = "string",
                                    description = "One of: Order status, Payment & checkout, Key delivery / activation, Refund request, Game / product question, Account & security, Technical issue / bug, Other."
                                },
                                urgency = new { type = "string", @enum = new[] { "low", "normal", "high" } },
                                summary = new { type = "string", description = "A short summary of the customer's issue for the specialist." }
                            },
                            required = new[] { "reason" }
                        }
                    }
                }
            }
        };
    }

    // ---- Escalation heuristics -------------------------------------------------

    private (bool ShouldEscalate, string Reason, string? Category, ChatPriority Priority) EvaluatePreEscalation(string userText)
    {
        var lower = userText.ToLowerInvariant();

        foreach (var (keyword, category) in HighRiskSignals)
        {
            if (lower.Contains(keyword, StringComparison.Ordinal))
            {
                return (true, $"High-risk signal detected: '{keyword}'.", category, ChatPriority.High);
            }
        }

        if (HumanRequestSignals.Any(signal => lower.Contains(signal, StringComparison.Ordinal)))
        {
            return (true, "Customer explicitly asked for a human specialist.", InferCategory(userText), ChatPriority.Normal);
        }

        return (false, string.Empty, null, ChatPriority.Normal);
    }

    private static string? InferCategory(string userText)
    {
        var lower = userText.ToLowerInvariant();
        foreach (var (keywords, category) in CategoryRules)
        {
            if (keywords.Any(k => lower.Contains(k, StringComparison.Ordinal)))
            {
                return category;
            }
        }

        return null;
    }

    private static ChatPriority MapUrgency(string? urgency, bool highRisk)
    {
        if (highRisk)
        {
            return ChatPriority.High;
        }

        return urgency?.Trim().ToLowerInvariant() switch
        {
            "high" => ChatPriority.High,
            "low" => ChatPriority.Low,
            _ => ChatPriority.Normal
        };
    }

    private static HandoffToolArgs ParseHandoffArgs(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<HandoffToolArgs>(json, ToolArgsJsonOptions) ?? new HandoffToolArgs();
        }
        catch (JsonException)
        {
            return new HandoffToolArgs { Reason = "Assistant requested a specialist." };
        }
    }

    // ---- Localization helpers --------------------------------------------------

    private static string? NormalizeLocale(string? locale)
    {
        if (string.IsNullOrWhiteSpace(locale))
        {
            return null;
        }

        var code = locale.Split('-', '_')[0].Trim().ToLowerInvariant();
        return code.Length == 2 ? code : null;
    }

    // Human-readable language name for the LLM directive. Defaults to English (the site default).
    private static string LanguageName(string? code) => code?.Trim().ToLowerInvariant() switch
    {
        "ru" => "Russian",
        "uk" => "Ukrainian",
        "pl" => "Polish",
        "en" => "English",
        _ => "English"
    };

    private static bool IsRussian(string? language) =>
        string.Equals(language, "ru", StringComparison.OrdinalIgnoreCase);

    private static string LocalizedText(string? language, string en, string ru) =>
        IsRussian(language) ? ru : en;

    private static string ClarifyPrompt(string? language) => LocalizedText(language,
        "I want to make sure I help with the right details. Could you share your order ID or account email, and a bit more about the issue?",
        "Хочу помочь точно по вашему случаю. Подскажите, пожалуйста, номер заказа или email аккаунта и пару слов о проблеме.");

    private static string BuildHandoffMessage(string? language, bool needsContact)
    {
        if (IsRussian(language))
        {
            return needsContact
                ? "Подключаю специалиста Tale Shop. Оставьте, пожалуйста, email или номер заказа — так мы быстрее разберёмся. Сотрудник скоро присоединится к чату."
                : "Подключаю специалиста Tale Shop — сотрудник скоро присоединится к чату и продолжит с вами.";
        }

        return needsContact
            ? "I'm connecting you with a Tale Shop specialist. Please share your email or order ID so we can look into it faster — a human will join this chat shortly."
            : "I'm connecting you with a Tale Shop specialist — a human will join this chat shortly to continue with you.";
    }

    // ---- Mapping & validation --------------------------------------------------

    private static string Shorten(string value, int max) =>
        string.IsNullOrEmpty(value) || value.Length <= max ? value : value[..max] + "…";

    private static string MapRole(ChatMessageRole role)
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
            Priority = session.Priority.ToString().ToLowerInvariant(),
            Category = session.Category,
            Language = session.Language,
            Summary = session.Summary,
            EscalationReason = session.EscalationReason,
            OrderId = session.OrderId
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
                ToolCall = message.Metadata?.ToolCall,
                Handoff = message.Metadata?.Handoff ?? false
            }
        };
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

    // Per-IP cap on new sessions — stops spammers bypassing the per-session limit by spawning sessions.
    private void EnsureIpSessionLimit(string? clientIp)
    {
        if (string.IsNullOrWhiteSpace(clientIp))
        {
            return;
        }

        if (!TryConsume($"chat_newsession_ip_{clientIp}", _options.MaxSessionsPerIpPerHour, TimeSpan.FromHours(1)))
        {
            throw new SupportChatRequestException(
                "Too many chats were started from your network. Please try again later.",
                StatusCodes.Status429TooManyRequests);
        }
    }

    // Per-IP message throughput cap (in addition to the per-session limit).
    private void EnsureIpMessageLimit(string? clientIp)
    {
        if (string.IsNullOrWhiteSpace(clientIp))
        {
            return;
        }

        if (!TryConsume($"chat_msg_ip_{clientIp}", _options.MaxMessagesPerIpPerMinute, TimeSpan.FromMinutes(1)))
        {
            throw new SupportChatRequestException(
                "You're sending messages too quickly. Please slow down and try again.",
                StatusCodes.Status429TooManyRequests);
        }
    }

    // Lifetime cap on user messages in one session — bounds cost of a single long-running abusive chat.
    private async Task EnsureSessionMessageCapAsync(ChatSession session)
    {
        var userMessages = await _messages.CountDocumentsAsync(
            m => m.SessionId == session.Id && m.Role == ChatMessageRole.User);
        if (userMessages >= _options.MaxMessagesPerSession)
        {
            throw new SupportChatRequestException(
                "This chat has reached its message limit. Please start a new chat or contact support.",
                StatusCodes.Status429TooManyRequests);
        }
    }

    // Sliding-window counter shared by the IP limiters (mirrors EnsureRateLimit's style).
    private bool TryConsume(string key, int max, TimeSpan window)
    {
        var count = _cache.TryGetValue<int>(key, out var current) ? current : 0;
        if (count >= max)
        {
            return false;
        }

        _cache.Set(key, count + 1, window);
        return true;
    }

    private static string BusyMessage(string? language) => LocalizedText(language,
        "We're getting a lot of questions right now — please resend in a moment, or I can bring in a human specialist.",
        "Сейчас очень много обращений — повторите сообщение через минуту, или я подключу живого специалиста.");

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

    private sealed class HandoffToolArgs
    {
        [JsonPropertyName("reason")] public string? Reason { get; set; }
        [JsonPropertyName("category")] public string? Category { get; set; }
        [JsonPropertyName("urgency")] public string? Urgency { get; set; }
        [JsonPropertyName("summary")] public string? Summary { get; set; }
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
