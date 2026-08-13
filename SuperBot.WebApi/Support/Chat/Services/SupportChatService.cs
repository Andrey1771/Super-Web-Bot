using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
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
    Task<ChatMessageDto> SetMessageFeedbackAsync(string sessionId, string messageId, string? feedback);
    Task<SupportChatStatsDto> GetStatsAsync(int days);
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

    private const string HandoffToolName = "handoff_to_human";

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
        - Keep replies short — around 120 words. Only a step-by-step activation or refund walkthrough
          may run longer. Never pad an answer with a recap of what the customer just said.

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
    // Word(...) matches the whole word only; Stem(...) also matches longer forms of it
    // (оператору, взломали, compromised). Plain substring matching used to fire on innocent
    // text — "суд" inside "судя по всему" escalated the chat at high priority.
    private static readonly EscalationSignal[] HumanRequestSignals =
    {
        Stem("human"), Word("real person"), Word("live agent"), Word("real agent"),
        Word("speak to someone"), Word("talk to a person"), Word("talk to someone"),
        Stem("operator"), Stem("manager"), Stem("representative"), Word("agent please"),
        Stem("оператор"), Stem("человек"), Word("живой"), Word("живого"),
        Stem("специалист"), Stem("менеджер"), Stem("сотрудник")
    };

    // High-risk situations that should reach a human even if not explicitly requested.
    private static readonly EscalationSignal[] HighRiskSignals =
    {
        Word("hacked", "Account & security"), Word("stolen", "Account & security"),
        Word("unauthorized", "Account & security"), Stem("compromis", "Account & security"),
        Stem("взлом", "Account & security"), Stem("украл", "Account & security"),
        Stem("доступ к аккаунт", "Account & security"),
        Word("chargeback", "Payment & checkout"), Word("fraud", "Payment & checkout"),
        Word("scam", "Payment & checkout"), Stem("мошен", "Payment & checkout"),
        Stem("чарджбэк", "Payment & checkout"),
        Word("lawsuit", "Other"), Word("legal action", "Other"), Word("court", "Other"),
        Word("суд", "Other"), Stem("судебн", "Other"), Stem("полиц", "Other")
    };

    // Lightweight category inference from the customer's words (mirrors the support taxonomy).
    private static readonly (EscalationSignal[] Signals, string Category)[] CategoryRules =
    {
        (new[] { Stem("refund"), Word("money back"), Stem("возврат"), Word("вернуть деньги") }, "Refund request"),
        (new[] { Stem("payment"), Stem("card"), Word("pay"), Word("declined"), Stem("оплат"), Stem("карта"), Stem("платеж") }, "Payment & checkout"),
        (new[] { Stem("activat"), Stem("redeem"), Stem("key"), Stem("code"), Stem("region"), Stem("актив"), Stem("ключ"), Stem("код"), Stem("регион") }, "Key delivery / activation"),
        (new[] { Stem("order"), Stem("deliver"), Stem("заказ"), Stem("доставк") }, "Order status"),
        (new[] { Stem("account"), Stem("login"), Word("2fa"), Stem("password"), Stem("аккаунт"), Stem("вход"), Stem("пароль") }, "Account & security"),
        (new[] { Stem("bug"), Stem("error"), Stem("crash"), Word("not working"), Stem("ошибк"), Word("баг"), Word("не работает") }, "Technical issue / bug"),
    };

    private readonly IMongoCollection<ChatSession> _sessions;
    private readonly IMongoCollection<ChatMessage> _messages;
    private readonly SupportChatOptions _options;
    private readonly IMemoryCache _cache;
    private readonly ISupportLlmClient _llm;
    private readonly ISupportKnowledgeBase _knowledgeBase;
    private readonly ISupportInstantAnswers _instantAnswers;
    private readonly ISupportNotificationService _notifications;
    private readonly ILlmConcurrencyLimiter _llmLimiter;
    private readonly ITurnstileVerifier _turnstile;
    private readonly ILlmSpendTracker _spend;
    private readonly ILogger<SupportChatService> _logger;

    private static readonly JsonSerializerOptions ToolArgsJsonOptions = new(JsonSerializerDefaults.Web);

    public SupportChatService(
        IMongoDatabase database,
        IOptions<SupportChatOptions> options,
        IMemoryCache cache,
        ISupportLlmClient llm,
        ISupportKnowledgeBase knowledgeBase,
        ISupportInstantAnswers instantAnswers,
        ISupportNotificationService notifications,
        ILlmConcurrencyLimiter llmLimiter,
        ITurnstileVerifier turnstile,
        ILlmSpendTracker spend,
        ILogger<SupportChatService> logger)
    {
        _sessions = database.GetCollection<ChatSession>("SupportChatSessions");
        _messages = database.GetCollection<ChatMessage>("SupportChatMessages");
        _options = options.Value;
        _cache = cache;
        _llm = llm;
        _knowledgeBase = knowledgeBase;
        _instantAnswers = instantAnswers;
        _notifications = notifications;
        _llmLimiter = llmLimiter;
        _turnstile = turnstile;
        _spend = spend;
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
        EnsureSessionOpen(session);
        return await BuildSessionDetailAsync(session, messageLimit);
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

    // Оператору закрытый диалог доступен: это история обращений, и открыть её
    // из списка (фильтр «closed») он должен уметь. Проверки на закрытость здесь нет намеренно.
    public async Task<ChatSessionDetailDto> GetSessionForAdminAsync(string sessionId, int messageLimit)
    {
        var session = await GetSessionEntityAsync(sessionId);
        return await BuildSessionDetailAsync(session, messageLimit);
    }

    private async Task<ChatSessionDetailDto> BuildSessionDetailAsync(ChatSession session, int messageLimit)
    {
        var messages = await GetMessagesInternalAsync(session.Id, messageLimit);
        return new ChatSessionDetailDto
        {
            Session = MapSession(session),
            Messages = messages.Select(MapMessage).ToList()
        };
    }

    public async Task<IReadOnlyList<ChatMessageDto>> GetMessagesAsync(string sessionId, DateTime? after)
    {
        var session = await GetSessionEntityAsync(sessionId);
        EnsureSessionOpen(session);
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
        EnsureSessionOpen(session);
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
            var handoff = await HandleEscalationAsync(session, sanitized, pre.Reason, pre.Category, pre.Priority, null, pre.Source);
            return new AddChatMessageResponse { Session = MapSession(session), AssistantMessage = MapMessage(handoff) };
        }

        var instant = await TryInstantAnswerAsync(session, sanitized);
        if (instant != null)
        {
            return new AddChatMessageResponse { Session = MapSession(session), AssistantMessage = MapMessage(instant) };
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
        EnsureSessionOpen(session);
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
            var handoff = await HandleEscalationAsync(session, sanitized, pre.Reason, pre.Category, pre.Priority, null, pre.Source);
            await onChunk(handoff.Text);
            return MapMessage(handoff);
        }

        // Заготовку отдаём одним куском: генерировать нечего, ждать нечего.
        var instant = await TryInstantAnswerAsync(session, sanitized);
        if (instant != null)
        {
            await onChunk(instant.Text);
            return MapMessage(instant);
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
        var request = BuildLlmRequest(history);

        var toolCallArguments = string.Empty;
        var filter = ReasoningFilter.CreateStreamFilter();
        var responseBuilder = new StringBuilder();
        // Расход провайдер присылает последним чанком, когда весь текст уже отдан клиенту.
        LlmUsage? usage = null;

        try
        {
            await _llm.StreamChatAsync(request, async chunk =>
            {
                if (!string.IsNullOrEmpty(chunk.Content))
                {
                    var visible = filter.Push(chunk.Content);
                    if (!string.IsNullOrEmpty(visible))
                    {
                        responseBuilder.Append(visible);
                        await onChunk(visible);
                    }
                }

                if (chunk.ToolCall is { } toolCall && toolCall.Name == HandoffToolName)
                {
                    toolCallArguments = toolCall.ArgumentsJson;
                }

                usage ??= chunk.Usage;
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
                args.Category, MapUrgency(args.Urgency, highRisk: false), args.Summary, EscalationSource.AssistantDecision);
            await onChunk("\n\n" + handoff.Text);
            return MapMessage(handoff);
        }

        var assistantText = responseBuilder.ToString().Trim();
        if (string.IsNullOrWhiteSpace(assistantText))
        {
            assistantText = ClarifyPrompt(session.Language);
            await onChunk(assistantText);
        }

        var assistantMessage = await SaveAssistantMessageAsync(session, assistantText, usage);
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

    public async Task<ChatMessageDto> SetMessageFeedbackAsync(string sessionId, string messageId, string? feedback)
    {
        var session = await GetSessionEntityAsync(sessionId);
        if (!ObjectId.TryParse(messageId, out _))
        {
            throw new SupportChatRequestException("Message not found.", StatusCodes.Status404NotFound);
        }

        var message = await _messages
            .Find(m => m.Id == messageId && m.SessionId == session.Id)
            .FirstOrDefaultAsync();

        if (message == null)
        {
            throw new SupportChatRequestException("Message not found.", StatusCodes.Status404NotFound);
        }

        // Оценивать имеет смысл только ответ бота: реплики оператора и свои же сообщения — нет.
        if (message.Role != ChatMessageRole.Assistant)
        {
            throw new SupportChatRequestException("Only assistant replies can be rated.", StatusCodes.Status400BadRequest);
        }

        var parsed = ParseFeedback(feedback);
        message.Metadata ??= new ChatMessageMetadata();
        message.Metadata.Feedback = parsed;

        await _messages.UpdateOneAsync(
            m => m.Id == message.Id,
            Builders<ChatMessage>.Update.Set(m => m.Metadata.Feedback, parsed));

        return MapMessage(message);
    }

    public async Task<SupportChatStatsDto> GetStatsAsync(int days)
    {
        var window = Math.Clamp(days, 1, 180);
        var from = DateTime.UtcNow.Date.AddDays(-(window - 1));

        var sessions = await _sessions
            .Find(s => s.CreatedAt >= from)
            .Project(s => new SessionStatRow
            {
                CreatedAt = s.CreatedAt,
                WasEscalated = s.WasEscalated,
                Source = s.EscalationSource,
                Category = s.Category
            })
            .ToListAsync();

        var replies = await _messages
            .Find(m => m.CreatedAt >= from && m.Role == ChatMessageRole.Assistant)
            .Project(m => new MessageStatRow
            {
                CreatedAt = m.CreatedAt,
                CostUsd = m.Metadata.CostUsd,
                Instant = m.Metadata.Instant,
                Feedback = m.Metadata.Feedback
            })
            .ToListAsync();

        var escalated = sessions.Count(s => s.WasEscalated);
        var totalCost = replies.Sum(r => r.CostUsd ?? 0);

        var daily = Enumerable.Range(0, window)
            .Select(offset => from.AddDays(offset))
            .Select(date => new DailyStatDto
            {
                Date = date,
                Sessions = sessions.Count(s => s.CreatedAt.Date == date),
                Escalated = sessions.Count(s => s.CreatedAt.Date == date && s.WasEscalated),
                CostUsd = replies.Where(r => r.CreatedAt.Date == date).Sum(r => r.CostUsd ?? 0)
            })
            .ToList();

        return new SupportChatStatsDto
        {
            Days = window,
            From = from,
            Sessions = sessions.Count,
            EscalatedSessions = escalated,
            // Доля диалогов, которые бот закрыл сам. Без обращений считаем нулём, а не делим на ноль.
            DeflectionRate = sessions.Count == 0 ? 0 : (double)(sessions.Count - escalated) / sessions.Count,
            EscalationsBySource = sessions
                .Where(s => s.WasEscalated)
                .GroupBy(s => FormatEscalationSource(s.Source))
                .Select(g => new StatCountDto { Label = g.Key, Count = g.Count() })
                .OrderByDescending(item => item.Count)
                .ToList(),
            TopCategories = sessions
                .Where(s => !string.IsNullOrWhiteSpace(s.Category))
                .GroupBy(s => s.Category!)
                .Select(g => new StatCountDto { Label = g.Key, Count = g.Count() })
                .OrderByDescending(item => item.Count)
                .Take(6)
                .ToList(),
            AiReplies = replies.Count,
            InstantReplies = replies.Count(r => r.Instant),
            BilledReplies = replies.Count(r => r.CostUsd > 0),
            TotalCostUsd = totalCost,
            CostPerSessionUsd = sessions.Count == 0 ? 0 : totalCost / sessions.Count,
            FeedbackHelpful = replies.Count(r => r.Feedback == ChatMessageFeedback.Helpful),
            FeedbackNotHelpful = replies.Count(r => r.Feedback == ChatMessageFeedback.NotHelpful),
            SpentTodayUsd = (double)_spend.SpentTodayUsd,
            DailyBudgetUsd = _options.DailyBudgetUsd,
            Daily = daily
        };
    }

    private static ChatMessageFeedback? ParseFeedback(string? feedback)
    {
        return feedback?.Trim().ToLowerInvariant() switch
        {
            "helpful" => ChatMessageFeedback.Helpful,
            "not_helpful" => ChatMessageFeedback.NotHelpful,
            null or "" => null,
            _ => throw new SupportChatRequestException("Unknown feedback value.", StatusCodes.Status400BadRequest)
        };
    }

    private static string? FormatFeedback(ChatMessageFeedback? feedback) => feedback switch
    {
        ChatMessageFeedback.Helpful => "helpful",
        ChatMessageFeedback.NotHelpful => "not_helpful",
        _ => null
    };

    private static string FormatEscalationSource(EscalationSource? source) => source switch
    {
        EscalationSource.HighRisk => "high_risk",
        EscalationSource.CustomerRequest => "customer_request",
        EscalationSource.AssistantDecision => "assistant_decision",
        // Диалоги, эскалированные до появления этого поля.
        _ => "unknown"
    };

    private class SessionStatRow
    {
        public DateTime CreatedAt { get; set; }

        public bool WasEscalated { get; set; }

        public EscalationSource? Source { get; set; }

        public string? Category { get; set; }
    }

    private class MessageStatRow
    {
        public DateTime CreatedAt { get; set; }

        public double? CostUsd { get; set; }

        public bool Instant { get; set; }

        public ChatMessageFeedback? Feedback { get; set; }
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
        var request = BuildLlmRequest(history);

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
            var response = await _llm.ChatAsync(request, linked.Token);

            var assistantText = ReasoningFilter.Strip(response.Content).Trim();
            var toolCall = response.ToolCall is { } call && call.Name == HandoffToolName ? call : null;
            var toolCallArguments = toolCall?.ArgumentsJson ?? string.Empty;

            if (!string.IsNullOrWhiteSpace(toolCallArguments))
            {
                var args = ParseHandoffArgs(toolCallArguments);
                var handoff = await HandleEscalationAsync(
                    session, userText, args.Reason ?? "Assistant requested a specialist.",
                    args.Category, MapUrgency(args.Urgency, highRisk: false), args.Summary, EscalationSource.AssistantDecision);
                return (handoff, session);
            }

            if (string.IsNullOrWhiteSpace(assistantText))
            {
                assistantText = ClarifyPrompt(session.Language);
            }

            var assistantMessage = await SaveAssistantMessageAsync(session, assistantText, response.Usage);
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

    /// <summary>
    /// Частые вопросы закрываются заранее написанным текстом — без обращения к модели.
    /// Возвращает null, если вопрос не опознан: тогда отвечает модель.
    /// </summary>
    private async Task<ChatMessage?> TryInstantAnswerAsync(ChatSession session, string userText)
    {
        if (!_options.InstantAnswersEnabled)
        {
            return null;
        }

        var answer = _instantAnswers.TryAnswer(
            userText, session.Language, _options.InstantAnswerMaxWords, _options.InstantAnswerMaxChars);
        if (answer == null)
        {
            return null;
        }

        // Тот же шаблон второй раз в одном диалоге означает, что он не помог, — зовём модель.
        var alreadyAnswered = await _messages.CountDocumentsAsync(
            m => m.SessionId == session.Id && m.Metadata.InstantTopic == answer.Topic);
        if (alreadyAnswered > 0)
        {
            return null;
        }

        var now = DateTime.UtcNow;
        var message = new ChatMessage
        {
            SessionId = session.Id,
            Role = ChatMessageRole.Assistant,
            AuthorName = AssistantName,
            Text = answer.Text,
            CreatedAt = now,
            Metadata = new ChatMessageMetadata { Instant = true, InstantTopic = answer.Topic }
        };

        await _messages.InsertOneAsync(message);
        await UpdateSessionActivityAsync(session, now);
        return message;
    }

    private async Task<ChatMessage> SaveAssistantMessageAsync(ChatSession session, string text, LlmUsage? usage = null)
    {
        var now = DateTime.UtcNow;
        var message = new ChatMessage
        {
            SessionId = session.Id,
            Role = ChatMessageRole.Assistant,
            AuthorName = AssistantName,
            Text = text,
            CreatedAt = now,
            Metadata = new ChatMessageMetadata
            {
                Model = _llm.Model,
                InputTokens = usage?.InputTokens,
                CachedInputTokens = usage?.CachedInputTokens,
                OutputTokens = usage?.OutputTokens,
                CostUsd = ToCostUsd(usage)
            }
        };

        await _messages.InsertOneAsync(message);
        await UpdateSessionActivityAsync(session, now);
        return message;
    }

    // Стоимость есть только у платного провайдера — у локальной модели токены бесплатны.
    private double? ToCostUsd(LlmUsage? usage)
    {
        var cost = _spend.EstimateUsd(usage);
        return cost > 0m ? (double?)cost : null;
    }

    private async Task<ChatMessage> HandleEscalationAsync(
        ChatSession session,
        string userText,
        string reason,
        string? category,
        ChatPriority priority,
        string? providedSummary,
        EscalationSource source)
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
        session.WasEscalated = true;
        session.EscalationSource = source;
        session.UpdatedAt = DateTime.UtcNow;

        await _sessions.UpdateOneAsync(
            s => s.Id == session.Id,
            Builders<ChatSession>.Update
                .Set(s => s.Status, session.Status)
                .Set(s => s.EscalationReason, session.EscalationReason)
                .Set(s => s.Category, session.Category)
                .Set(s => s.Priority, session.Priority)
                .Set(s => s.Summary, session.Summary)
                .Set(s => s.WasEscalated, session.WasEscalated)
                .Set(s => s.EscalationSource, session.EscalationSource)
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
                Model = _llm.Model,
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

    /// <summary>
    /// Собирает запрос так, чтобы его начало как можно дольше оставалось неизменным: у внешнего
    /// провайдера повторяющийся префикс оплачивается по цене кэша, а она в десятки раз ниже.
    /// Отсюда порядок: неизменная инструкция → язык → выжимка отброшенного → история →
    /// база знаний последней, потому что она меняется каждый ход и рвёт кэш всему, что за ней.
    /// </summary>
    private async Task<List<LlmChatMessage>> BuildHistoryAsync(string sessionId, string latestUserText, string? language)
    {
        var prompt = new List<LlmChatMessage>
        {
            // Одинаково для всех диалогов и всех ходов — самый ценный кусок кэша.
            new() { Role = "system", Content = SystemPromptBase },
            // Explicit, deterministic reply language driven by the site locale (not model guesswork).
            new() { Role = "system", Content = $"Reply language: {LanguageName(language)}." }
        };

        var total = (int)await _messages.CountDocumentsAsync(m => m.SessionId == sessionId);
        var skip = HistoryAnchor(total);

        if (skip > 0)
        {
            var earlier = await BuildEarlierContextAsync(sessionId, skip);
            if (!string.IsNullOrEmpty(earlier))
            {
                prompt.Add(new LlmChatMessage { Role = "system", Content = earlier });
            }
        }

        var window = await _messages
            .Find(m => m.SessionId == sessionId)
            .SortBy(m => m.CreatedAt)
            .Skip(skip)
            .ToListAsync();

        foreach (var message in window)
        {
            prompt.Add(new LlmChatMessage
            {
                Role = MapRole(message.Role),
                Content = message.Text
            });
        }

        var context = _knowledgeBase.BuildContextBlock(
            latestUserText, _options.KnowledgeArticles, _options.KnowledgeArticleMaxChars);
        if (!string.IsNullOrEmpty(context))
        {
            prompt.Add(new LlmChatMessage { Role = "system", Content = context });
        }

        return prompt;
    }

    /// <summary>
    /// Сколько сообщений отбросить с начала. Значение квантовано шагом, поэтому окно съезжает
    /// не каждый ход, а раз в несколько — между сдвигами начало запроса совпадает дословно.
    /// </summary>
    private int HistoryAnchor(int totalMessages)
    {
        var step = Math.Max(1, _options.HistoryTrimStepMessages);
        var window = Math.Max(4, _options.HistoryLimit - step);
        if (totalMessages <= window)
        {
            return 0;
        }

        return (totalMessages - window) / step * step;
    }

    /// <summary>
    /// Замена отброшенному началу переписки. Намеренно без обращения к модели: отдельный вызов
    /// ради пересказа съел бы всю экономию. Первая реплика клиента несёт суть обращения,
    /// остальное восстанавливается из карточки диалога.
    /// </summary>
    private async Task<string> BuildEarlierContextAsync(string sessionId, int skipped)
    {
        var first = await _messages
            .Find(m => m.SessionId == sessionId && m.Role == ChatMessageRole.User)
            .SortBy(m => m.CreatedAt)
            .FirstOrDefaultAsync();

        if (first == null)
        {
            return string.Empty;
        }

        return $"EARLIER IN THIS CONVERSATION ({skipped} older messages are not shown):\n" +
               $"The customer originally wrote: \"{Shorten(first.Text, 300)}\"";
    }

    private LlmChatRequest BuildLlmRequest(List<LlmChatMessage> messages)
    {
        return new LlmChatRequest
        {
            Messages = messages,
            Temperature = _options.Temperature,
            MaxOutputTokens = _options.MaxResponseTokens > 0 ? _options.MaxResponseTokens : null,
            Tools = new List<LlmToolDefinition>
            {
                new()
                {
                    Name = HandoffToolName,
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
        };
    }

    // ---- Escalation heuristics -------------------------------------------------

    private (bool ShouldEscalate, string Reason, string? Category, ChatPriority Priority, EscalationSource Source) EvaluatePreEscalation(string userText)
    {
        foreach (var signal in HighRiskSignals)
        {
            if (signal.Matches(userText))
            {
                return (true, $"High-risk signal detected: '{signal.Keyword}'.", signal.Category, ChatPriority.High, EscalationSource.HighRisk);
            }
        }

        if (HumanRequestSignals.Any(signal => signal.Matches(userText)))
        {
            return (true, "Customer explicitly asked for a human specialist.", InferCategory(userText), ChatPriority.Normal, EscalationSource.CustomerRequest);
        }

        return (false, string.Empty, null, ChatPriority.Normal, EscalationSource.AssistantDecision);
    }

    private static string? InferCategory(string userText)
    {
        foreach (var (signals, category) in CategoryRules)
        {
            if (signals.Any(signal => signal.Matches(userText)))
            {
                return category;
            }
        }

        return null;
    }

    // A keyword anchored to a word boundary, so it can no longer fire from inside another word.
    private sealed record EscalationSignal(string Keyword, Regex Pattern, string? Category)
    {
        public bool Matches(string text) => Pattern.IsMatch(text);
    }

    /// <summary>Matches the keyword as a whole word: "суд" no longer fires on "судя по всему".</summary>
    private static EscalationSignal Word(string keyword, string? category = null) =>
        new(keyword, BuildSignalPattern(keyword, wholeWord: true), category);

    /// <summary>Matches the keyword as the start of a word, for stems with many endings (взлом → взломали).</summary>
    private static EscalationSignal Stem(string keyword, string? category = null) =>
        new(keyword, BuildSignalPattern(keyword, wholeWord: false), category);

    private static Regex BuildSignalPattern(string keyword, bool wholeWord)
    {
        var escaped = Regex.Escape(keyword);
        var pattern = wholeWord ? $@"\b{escaped}\b" : $@"\b{escaped}";
        return new Regex(pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);
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
                Handoff = message.Metadata?.Handoff ?? false,
                Feedback = FormatFeedback(message.Metadata?.Feedback)
            }
        };
    }

    // Закрытый диалог недоступен клиенту ни на чтение, ни на запись: по 409 виджет
    // предложит начать новый. Оператора это не касается — см. GetSessionForAdminAsync.
    private static void EnsureSessionOpen(ChatSession session)
    {
        if (session.Status == ChatSessionStatus.Closed)
        {
            throw new SupportChatRequestException("This chat session is closed.", StatusCodes.Status409Conflict);
        }
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
