using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.WebApi.Recovery.Models;

public enum RecoveryRequestStatus
{
    // Ждёт проверки оператором
    Pending,
    // Одобрена, идёт период ожидания (ExecuteAfter)
    Approved,
    // 2FA сброшена, письмо со сбросом пароля отправлено
    Executed,
    // Отклонена оператором
    Rejected,
    // Отменена владельцем (по ссылке из письма или из живой сессии)
    Cancelled
}

// Пункт чек-листа сверки: null — ещё не проверен.
public class RecoveryChecklistItem
{
    [BsonElement("key")]
    public string Key { get; set; } = string.Empty;

    [BsonElement("label")]
    public string Label { get; set; } = string.Empty;

    [BsonElement("passed")]
    public bool? Passed { get; set; }
}

public class RecoveryAuditEntry
{
    [BsonElement("at")]
    public DateTime At { get; set; }

    // Кто сделал действие: email/username оператора, "system" или "account-owner"
    [BsonElement("actor")]
    public string Actor { get; set; } = string.Empty;

    [BsonElement("action")]
    public string Action { get; set; } = string.Empty;

    [BsonElement("details")]
    public string? Details { get; set; }
}

public class RecoveryRequest
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = string.Empty;

    // Короткий публичный номер для переписки (REC-XXXXXX)
    [BsonElement("publicId")]
    public string PublicId { get; set; } = string.Empty;

    // Что заявил человек
    [BsonElement("accountEmail")]
    public string AccountEmail { get; set; } = string.Empty;

    [BsonElement("contactEmail")]
    public string ContactEmail { get; set; } = string.Empty;

    [BsonElement("claimedOrderNumbers")]
    public string ClaimedOrderNumbers { get; set; } = string.Empty;

    [BsonElement("claimedCardLast4")]
    public string ClaimedCardLast4 { get; set; } = string.Empty;

    [BsonElement("message")]
    public string Message { get; set; } = string.Empty;

    // Откуда пришла заявка
    [BsonElement("requestIp")]
    public string RequestIp { get; set; } = string.Empty;

    [BsonElement("requestUserAgent")]
    public string RequestUserAgent { get; set; } = string.Empty;

    // Найденный по email пользователь Keycloak (null — аккаунта не существует; заявителю это не раскрывается)
    [BsonElement("resolvedUserId")]
    public string? ResolvedUserId { get; set; }

    [BsonRepresentation(BsonType.String)]
    [BsonElement("status")]
    public RecoveryRequestStatus Status { get; set; } = RecoveryRequestStatus.Pending;

    // Токен для отмены по ссылке из письма (работает без логина)
    [BsonElement("cancelToken")]
    public string CancelToken { get; set; } = string.Empty;

    [BsonElement("checklist")]
    public List<RecoveryChecklistItem> Checklist { get; set; } = new();

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; }

    [BsonElement("updatedAt")]
    public DateTime UpdatedAt { get; set; }

    [BsonElement("approvedAt")]
    public DateTime? ApprovedAt { get; set; }

    [BsonElement("approvedBy")]
    public string? ApprovedBy { get; set; }

    // Раньше этого момента исполнение запрещено (период ожидания)
    [BsonElement("executeAfter")]
    public DateTime? ExecuteAfter { get; set; }

    [BsonElement("executedAt")]
    public DateTime? ExecutedAt { get; set; }

    [BsonElement("executedBy")]
    public string? ExecutedBy { get; set; }

    [BsonElement("rejectedAt")]
    public DateTime? RejectedAt { get; set; }

    [BsonElement("rejectedBy")]
    public string? RejectedBy { get; set; }

    [BsonElement("rejectReason")]
    public string? RejectReason { get; set; }

    [BsonElement("cancelledAt")]
    public DateTime? CancelledAt { get; set; }

    // "email-link" | "session"
    [BsonElement("cancelSource")]
    public string? CancelSource { get; set; }

    [BsonElement("auditLog")]
    public List<RecoveryAuditEntry> AuditLog { get; set; } = new();
}
