namespace SuperBot.WebApi.Support.Chat.Dto;

public class CreateChatSessionRequest
{
    public string? Email { get; set; }

    public string? OrderId { get; set; }

    public string? Locale { get; set; }

    // Cloudflare Turnstile token (present only when the widget is enabled).
    public string? TurnstileToken { get; set; }
}

public class CreateChatSessionResponse
{
    public string SessionId { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;
}

public class ChatSessionDto
{
    public string Id { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public string? UserId { get; set; }

    public string? Email { get; set; }

    public string Status { get; set; } = string.Empty;

    public string? AssignedAgentId { get; set; }

    public string? AssignedAgentName { get; set; }

    public DateTime? LastMessageAt { get; set; }

    public List<string> Tags { get; set; } = new();

    public string Priority { get; set; } = "normal";

    public string? Category { get; set; }

    public string? Language { get; set; }

    public string? Summary { get; set; }

    public string? EscalationReason { get; set; }

    public string? OrderId { get; set; }
}

public class ChatSessionDetailDto
{
    public ChatSessionDto Session { get; set; } = new();

    public IReadOnlyList<ChatMessageDto> Messages { get; set; } = Array.Empty<ChatMessageDto>();
}

public class ChatSessionListResponse
{
    public IReadOnlyList<ChatSessionSummaryDto> Items { get; set; } = Array.Empty<ChatSessionSummaryDto>();

    public int Page { get; set; }

    public int PageSize { get; set; }

    public long Total { get; set; }
}

public class ChatSessionSummaryDto
{
    public string Id { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public string? UserId { get; set; }

    public string? Email { get; set; }

    public string? AssignedAgentName { get; set; }

    public DateTime? LastMessageAt { get; set; }

    public string? LastMessagePreview { get; set; }

    public List<string> Tags { get; set; } = new();

    public string Priority { get; set; } = "normal";
}

public class ChatMessageDto
{
    public string Id { get; set; } = string.Empty;

    public string SessionId { get; set; } = string.Empty;

    public string Role { get; set; } = string.Empty;

    public string AuthorName { get; set; } = string.Empty;

    public string Text { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    public ChatMessageMetadataDto Metadata { get; set; } = new();
}

public class ChatMessageMetadataDto
{
    public string? Model { get; set; }

    public double? Confidence { get; set; }

    public string? EscalationReason { get; set; }

    public string? ToolCall { get; set; }

    public bool Handoff { get; set; }

    /// <summary>"helpful" | "not_helpful" | null — оценка ответа клиентом.</summary>
    public string? Feedback { get; set; }
}

/// <summary>Явная просьба передать диалог специалисту: с описанием проблемы и контактами.</summary>
public class RequestHandoffRequest
{
    public string? Note { get; set; }

    public string? Email { get; set; }

    public string? OrderId { get; set; }
}

public class ChatMessageFeedbackRequest
{
    /// <summary>"helpful", "not_helpful" или пусто, чтобы снять оценку.</summary>
    public string? Feedback { get; set; }
}

/// <summary>Сводка по чату поддержки для админки: сколько забрал бот, за что платим, что не понравилось.</summary>
public class SupportChatStatsDto
{
    public int Days { get; set; }

    public DateTime From { get; set; }

    public int Sessions { get; set; }

    public int EscalatedSessions { get; set; }

    /// <summary>Доля диалогов, закрытых без оператора.</summary>
    public double DeflectionRate { get; set; }

    public List<StatCountDto> EscalationsBySource { get; set; } = new();

    public List<StatCountDto> TopCategories { get; set; } = new();

    public int AiReplies { get; set; }

    /// <summary>Ответов, выданных из заготовок — без обращения к модели и бесплатно.</summary>
    public int InstantReplies { get; set; }

    /// <summary>Ответов, за которые платили внешнему провайдеру.</summary>
    public int BilledReplies { get; set; }

    public double TotalCostUsd { get; set; }

    public double CostPerSessionUsd { get; set; }

    public int FeedbackHelpful { get; set; }

    public int FeedbackNotHelpful { get; set; }

    public double SpentTodayUsd { get; set; }

    public decimal DailyBudgetUsd { get; set; }

    public List<DailyStatDto> Daily { get; set; } = new();
}

public class StatCountDto
{
    public string Label { get; set; } = string.Empty;

    public int Count { get; set; }
}

public class DailyStatDto
{
    public DateTime Date { get; set; }

    public int Sessions { get; set; }

    public int Escalated { get; set; }

    public double CostUsd { get; set; }
}

public class UpdateChatContactRequest
{
    public string? Email { get; set; }

    public string? OrderId { get; set; }
}

public class AddChatMessageRequest
{
    public string Text { get; set; } = string.Empty;
}

public class AddChatMessageResponse
{
    public ChatSessionDto Session { get; set; } = new();

    public ChatMessageDto? AssistantMessage { get; set; }
}

public class ChatConfigDto
{
    /// <summary>Часы работы заданы — виджету есть что обещать по срокам.</summary>
    public bool BusinessHoursConfigured { get; set; }

    public bool SupportIsOpen { get; set; }

    public int ExpectedWaitMinutes { get; set; }

    /// <summary>Время открытия «HH:mm» в часовом поясе поддержки, когда сейчас закрыто.</summary>
    public string? OpensAt { get; set; }

    public bool StreamingEnabled { get; set; }

    // Public Turnstile site key for the frontend to render the widget; null/empty = disabled.
    public string? TurnstileSiteKey { get; set; }
}

public class ChatAgentMessageRequest
{
    public string Text { get; set; } = string.Empty;
}

public class UpdateChatSessionRequest
{
    public string? Status { get; set; }

    public string? Priority { get; set; }

    public string? Tag { get; set; }
}
