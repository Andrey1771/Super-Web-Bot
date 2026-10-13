namespace SuperBot.WebApi.Recovery.Dto;

// ---- Публичная часть (заявитель) ----

public class CreateRecoveryRequestDto
{
    public string AccountEmail { get; set; } = string.Empty;
    public string? ContactEmail { get; set; }
    public string? OrderNumbers { get; set; }
    public string? CardLast4 { get; set; }
    public string? Message { get; set; }
}

public class PendingRecoveryDto
{
    public bool Exists { get; set; }
    public string? PublicId { get; set; }
    public string? Status { get; set; }
    public DateTime? CreatedAt { get; set; }
    public DateTime? ExecuteAfter { get; set; }
}

// ---- Админская часть ----

public class RecoveryRequestSummaryDto
{
    public string Id { get; set; } = string.Empty;
    public string PublicId { get; set; } = string.Empty;
    public string AccountEmail { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public bool AccountFound { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? ExecuteAfter { get; set; }
}

public class RecoveryChecklistItemDto
{
    public string Key { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public bool? Passed { get; set; }
}

public class RecoveryAuditEntryDto
{
    public DateTime At { get; set; }
    public string Actor { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string? Details { get; set; }
}

public class RecoverySessionDto
{
    public string IpAddress { get; set; } = string.Empty;
    public DateTime Start { get; set; }
    public DateTime LastAccess { get; set; }
}

public class RecoveryLoginEventDto
{
    public DateTime Time { get; set; }
    public string Type { get; set; } = string.Empty;
    public string? IpAddress { get; set; }
    public string? ClientId { get; set; }
}

public class RecoveryOrderDto
{
    public string? OrderNumber { get; set; }
    public string GameName { get; set; } = string.Empty;
    public decimal? TotalAmount { get; set; }
    public string? Currency { get; set; }
    public bool IsPaid { get; set; }
    public DateTime CreatedAt { get; set; }
}

// Снимок аккаунта из Keycloak + наших данных — правая половина карточки оператора.
public class RecoveryAccountSnapshotDto
{
    public bool Found { get; set; }
    public string? UserId { get; set; }
    public string? Username { get; set; }
    public string? Email { get; set; }
    public bool EmailVerified { get; set; }
    public bool Enabled { get; set; }
    public DateTime? AccountCreatedAt { get; set; }
    public bool TwoFactorEnabled { get; set; }
    public bool BackupCodesGenerated { get; set; }
    public int? BackupCodesRemaining { get; set; }
    public List<RecoverySessionDto> ActiveSessions { get; set; } = new();
    public List<RecoveryLoginEventDto> LoginEvents { get; set; } = new();
    public List<RecoveryOrderDto> RecentOrders { get; set; } = new();
    // Не критично, если события не получились (нет роли view-events) — покажем причину.
    public string? LoginEventsError { get; set; }
}

public class RecoveryRequestDetailDto
{
    public string Id { get; set; } = string.Empty;
    public string PublicId { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string AccountEmail { get; set; } = string.Empty;
    public string ContactEmail { get; set; } = string.Empty;
    public string ClaimedOrderNumbers { get; set; } = string.Empty;
    public string ClaimedCardLast4 { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string RequestIp { get; set; } = string.Empty;
    public string RequestUserAgent { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public string? ApprovedBy { get; set; }
    public DateTime? ExecuteAfter { get; set; }
    public DateTime? ExecutedAt { get; set; }
    public string? ExecutedBy { get; set; }
    public DateTime? RejectedAt { get; set; }
    public string? RejectedBy { get; set; }
    public string? RejectReason { get; set; }
    public DateTime? CancelledAt { get; set; }
    public string? CancelSource { get; set; }
    public List<RecoveryChecklistItemDto> Checklist { get; set; } = new();
    public List<RecoveryAuditEntryDto> AuditLog { get; set; } = new();
    public RecoveryAccountSnapshotDto Account { get; set; } = new();
}

public class UpdateChecklistDto
{
    public List<RecoveryChecklistItemDto> Items { get; set; } = new();
}

public class RejectRecoveryDto
{
    public string? Reason { get; set; }
}
