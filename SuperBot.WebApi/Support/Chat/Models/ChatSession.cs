using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.WebApi.Support.Chat.Models;

public class ChatSession
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public string? UserId { get; set; }

    public string? Email { get; set; }

    public string? OrderId { get; set; }

    public string? Locale { get; set; }

    [BsonRepresentation(BsonType.String)]
    public ChatSessionStatus Status { get; set; } = ChatSessionStatus.Ai;

    public string? AssignedAgentId { get; set; }

    public string? AssignedAgentName { get; set; }

    public DateTime? LastMessageAt { get; set; }

    public List<string> Tags { get; set; } = new();

    [BsonRepresentation(BsonType.String)]
    public ChatPriority Priority { get; set; } = ChatPriority.Normal;

    public string? EscalationReason { get; set; }

    // Detected intent category (from the handoff tool call or the support taxonomy).
    public string? Category { get; set; }

    // Best-effort detected language of the customer (e.g. "ru", "en"), so an agent knows what to expect.
    public string? Language { get; set; }

    // AI-generated conversation summary captured at escalation time for the specialist.
    public string? Summary { get; set; }

    // Когда виджет клиента последний раз опрашивал сервер, и было ли при этом открыто окно
    // чата. По этой паре специалист видит, читает ли клиент ответ прямо сейчас или ушёл:
    // писать «сейчас вернусь» в пустоту — самая обидная трата его времени.
    public DateTime? LastSeenAt { get; set; }

    public bool LastSeenViewing { get; set; }

    // Статус со временем меняется (needs_agent → assigned → closed), поэтому «дошло ли до человека»
    // фиксируем отдельным флагом — по нему считается доля диалогов, закрытых без оператора.
    public bool WasEscalated { get; set; }

    // Кто инициировал передачу человеку. Разбирать для этого текст EscalationReason ненадёжно.
    [BsonRepresentation(BsonType.String)]
    public EscalationSource? EscalationSource { get; set; }
}

public enum EscalationSource
{
    /// <summary>Сработало слово из списка высокого риска: взлом, чарджбэк, угроза судом.</summary>
    HighRisk,

    /// <summary>Клиент написал словами, что хочет человека.</summary>
    CustomerRequest,

    /// <summary>Клиент нажал кнопку передачи специалисту — осознанное действие, а не оборот речи.</summary>
    CustomerButton,

    /// <summary>Модель решила, что не справляется, и вызвала handoff_to_human.</summary>
    AssistantDecision
}

public enum ChatSessionStatus
{
    Open,
    Ai,
    NeedsAgent,
    Assigned,
    Closed
}

public enum ChatPriority
{
    Low,
    Normal,
    High
}
