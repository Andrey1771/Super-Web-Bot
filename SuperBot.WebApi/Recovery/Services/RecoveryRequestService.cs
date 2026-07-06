using System.Security.Cryptography;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Recovery.Dto;
using SuperBot.WebApi.Recovery.Models;
using SuperBot.WebApi.Services;

namespace SuperBot.WebApi.Recovery.Services;

public class RecoveryRequestException : Exception
{
    public int StatusCode { get; }

    public RecoveryRequestException(string message, int statusCode = 400) : base(message)
    {
        StatusCode = statusCode;
    }
}

public interface IRecoveryRequestService
{
    Task CreateAsync(CreateRecoveryRequestDto dto, string ip, string userAgent);
    Task<PendingRecoveryDto> GetActiveForUserAsync(string userId);
    Task<bool> CancelByTokenAsync(string token);
    Task<bool> CancelByUserAsync(string userId);

    Task<List<RecoveryRequestSummaryDto>> ListAsync(string? status);
    Task<RecoveryRequestDetailDto> GetDetailAsync(string id);
    Task<RecoveryRequestDetailDto> UpdateChecklistAsync(string id, UpdateChecklistDto dto, string actor);
    Task<RecoveryRequestDetailDto> ApproveAsync(string id, string actor);
    Task<RecoveryRequestDetailDto> RejectAsync(string id, string actor, string? reason);
    Task<RecoveryRequestDetailDto> ExecuteAsync(string id, string actor);
}

public class RecoveryRequestService : IRecoveryRequestService
{
    // Фиксированный чек-лист сверки — оператор обязан пройтись по каждому пункту.
    private static readonly (string Key, string Label)[] DefaultChecklist =
    {
        ("orders-match", "Order numbers match our records"),
        ("amounts-match", "Payment amounts named correctly"),
        ("card-match", "Card last 4 digits match payment history"),
        ("geo-match", "Request origin is consistent with login history"),
        ("contact-plausible", "Contact mailbox looks plausible (ideally the account email itself)")
    };

    private readonly IMongoCollection<RecoveryRequest> _requests;
    private readonly KeycloakAdminClient _keycloak;
    private readonly IOrderRepository _orders;
    private readonly RecoveryMailService _mail;
    private readonly RecoveryOptions _options;
    private readonly IMemoryCache _cache;
    private readonly IConfiguration _configuration;
    private readonly ILogger<RecoveryRequestService> _logger;

    public RecoveryRequestService(
        IMongoDatabase database,
        KeycloakAdminClient keycloak,
        IOrderRepository orders,
        RecoveryMailService mail,
        IOptions<RecoveryOptions> options,
        IMemoryCache cache,
        IConfiguration configuration,
        ILogger<RecoveryRequestService> logger)
    {
        _requests = database.GetCollection<RecoveryRequest>("RecoveryRequests");
        _keycloak = keycloak;
        _orders = orders;
        _mail = mail;
        _options = options.Value;
        _cache = cache;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task CreateAsync(CreateRecoveryRequestDto dto, string ip, string userAgent)
    {
        var accountEmail = (dto.AccountEmail ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(accountEmail) || !accountEmail.Contains('@'))
        {
            throw new RecoveryRequestException("Valid account email is required.");
        }

        // Анти-перебор: не больше N заявок с одного IP в час. Ответ наружу всё равно generic.
        var rateKey = $"recovery-rate:{ip}";
        var attempts = _cache.GetOrCreate(rateKey, entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1);
            return 0;
        });
        if (attempts >= _options.MaxRequestsPerIpPerHour)
        {
            _logger.LogWarning("Recovery request rate limit hit for IP {Ip}", ip);
            return;
        }
        _cache.Set(rateKey, attempts + 1, TimeSpan.FromHours(1));

        // Уже есть активная заявка на этот email — вторую не создаём (и не сообщаем об этом заявителю).
        var activeFilter = Builders<RecoveryRequest>.Filter.Eq(r => r.AccountEmail, accountEmail) &
                           Builders<RecoveryRequest>.Filter.In(r => r.Status, new[] { RecoveryRequestStatus.Pending, RecoveryRequestStatus.Approved });
        if (await _requests.Find(activeFilter).AnyAsync())
        {
            _logger.LogInformation("Duplicate recovery request for {Email} ignored", accountEmail);
            return;
        }

        // Существование аккаунта заявителю не раскрываем — просто фиксируем результат для оператора.
        string? resolvedUserId = null;
        try
        {
            resolvedUserId = (await _keycloak.FindUserByEmailAsync(accountEmail))?.Id;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Keycloak lookup failed while creating recovery request");
        }

        var now = DateTime.UtcNow;
        var request = new RecoveryRequest
        {
            PublicId = $"REC-{RandomNumberGenerator.GetInt32(100000, 999999)}",
            AccountEmail = accountEmail,
            ContactEmail = string.IsNullOrWhiteSpace(dto.ContactEmail) ? accountEmail : dto.ContactEmail.Trim(),
            ClaimedOrderNumbers = (dto.OrderNumbers ?? string.Empty).Trim(),
            ClaimedCardLast4 = (dto.CardLast4 ?? string.Empty).Trim(),
            Message = (dto.Message ?? string.Empty).Trim(),
            RequestIp = ip,
            RequestUserAgent = userAgent,
            ResolvedUserId = resolvedUserId,
            Status = RecoveryRequestStatus.Pending,
            CancelToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)),
            Checklist = DefaultChecklist.Select(item => new RecoveryChecklistItem { Key = item.Key, Label = item.Label }).ToList(),
            CreatedAt = now,
            UpdatedAt = now,
            AuditLog =
            {
                new RecoveryAuditEntry { At = now, Actor = "system", Action = "created", Details = $"from {ip}" }
            }
        };

        await _requests.InsertOneAsync(request);

        // Владельцу — письмо с кнопкой отмены (даже если заявку подал не он, особенно если не он).
        if (resolvedUserId != null)
        {
            await _mail.SendRequestCreatedAsync(request);
        }
    }

    public async Task<PendingRecoveryDto> GetActiveForUserAsync(string userId)
    {
        var request = await FindActiveByUserAsync(userId);
        if (request == null)
        {
            return new PendingRecoveryDto { Exists = false };
        }

        return new PendingRecoveryDto
        {
            Exists = true,
            PublicId = request.PublicId,
            Status = request.Status.ToString(),
            CreatedAt = request.CreatedAt,
            ExecuteAfter = request.ExecuteAfter
        };
    }

    public async Task<bool> CancelByTokenAsync(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return false;
        }
        var filter = Builders<RecoveryRequest>.Filter.Eq(r => r.CancelToken, token) &
                     Builders<RecoveryRequest>.Filter.In(r => r.Status, new[] { RecoveryRequestStatus.Pending, RecoveryRequestStatus.Approved });
        var request = await _requests.Find(filter).FirstOrDefaultAsync();
        if (request == null)
        {
            return false;
        }
        await CancelAsync(request, "email-link");
        return true;
    }

    public async Task<bool> CancelByUserAsync(string userId)
    {
        var request = await FindActiveByUserAsync(userId);
        if (request == null)
        {
            return false;
        }
        await CancelAsync(request, "session");
        return true;
    }

    public async Task<List<RecoveryRequestSummaryDto>> ListAsync(string? status)
    {
        var filter = Builders<RecoveryRequest>.Filter.Empty;
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<RecoveryRequestStatus>(status, true, out var parsed))
        {
            filter = Builders<RecoveryRequest>.Filter.Eq(r => r.Status, parsed);
        }

        var items = await _requests.Find(filter)
            .SortByDescending(r => r.CreatedAt)
            .Limit(200)
            .ToListAsync();

        return items.Select(r => new RecoveryRequestSummaryDto
        {
            Id = r.Id,
            PublicId = r.PublicId,
            AccountEmail = r.AccountEmail,
            Status = r.Status.ToString(),
            AccountFound = r.ResolvedUserId != null,
            CreatedAt = r.CreatedAt,
            UpdatedAt = r.UpdatedAt,
            ExecuteAfter = r.ExecuteAfter
        }).ToList();
    }

    public async Task<RecoveryRequestDetailDto> GetDetailAsync(string id)
    {
        var request = await GetByIdAsync(id);
        var detail = MapDetail(request);
        detail.Account = await BuildAccountSnapshotAsync(request);
        return detail;
    }

    public async Task<RecoveryRequestDetailDto> UpdateChecklistAsync(string id, UpdateChecklistDto dto, string actor)
    {
        var request = await GetByIdAsync(id);
        EnsureStatus(request, RecoveryRequestStatus.Pending);

        foreach (var item in dto.Items)
        {
            var existing = request.Checklist.FirstOrDefault(c => c.Key == item.Key);
            if (existing != null)
            {
                existing.Passed = item.Passed;
            }
        }
        request.UpdatedAt = DateTime.UtcNow;
        request.AuditLog.Add(new RecoveryAuditEntry
        {
            At = request.UpdatedAt,
            Actor = actor,
            Action = "checklist-updated",
            Details = string.Join(", ", request.Checklist.Select(c => $"{c.Key}={(c.Passed.HasValue ? (c.Passed.Value ? "ok" : "fail") : "?")}"))
        });

        await _requests.ReplaceOneAsync(r => r.Id == request.Id, request);
        var detail = MapDetail(request);
        detail.Account = await BuildAccountSnapshotAsync(request);
        return detail;
    }

    public async Task<RecoveryRequestDetailDto> ApproveAsync(string id, string actor)
    {
        var request = await GetByIdAsync(id);
        EnsureStatus(request, RecoveryRequestStatus.Pending);
        if (request.ResolvedUserId == null)
        {
            throw new RecoveryRequestException("Account not found in Keycloak — nothing to recover.", 409);
        }
        // Одобрять, не пройдя чек-лист, нельзя — в этом весь смысл процедуры.
        var unchecked_ = request.Checklist.Where(c => c.Passed == null).Select(c => c.Label).ToList();
        if (unchecked_.Count > 0)
        {
            throw new RecoveryRequestException($"Checklist is not complete: {string.Join("; ", unchecked_)}", 409);
        }

        var now = DateTime.UtcNow;
        request.Status = RecoveryRequestStatus.Approved;
        request.ApprovedAt = now;
        request.ApprovedBy = actor;
        request.ExecuteAfter = now.AddHours(_options.WaitingPeriodHours);
        request.UpdatedAt = now;
        request.AuditLog.Add(new RecoveryAuditEntry { At = now, Actor = actor, Action = "approved", Details = $"execute after {request.ExecuteAfter:u}" });

        await _requests.ReplaceOneAsync(r => r.Id == request.Id, request);
        await _mail.SendRequestApprovedAsync(request);

        var detail = MapDetail(request);
        detail.Account = await BuildAccountSnapshotAsync(request);
        return detail;
    }

    public async Task<RecoveryRequestDetailDto> RejectAsync(string id, string actor, string? reason)
    {
        var request = await GetByIdAsync(id);
        if (request.Status is not (RecoveryRequestStatus.Pending or RecoveryRequestStatus.Approved))
        {
            throw new RecoveryRequestException($"Request is already {request.Status}.", 409);
        }

        var now = DateTime.UtcNow;
        request.Status = RecoveryRequestStatus.Rejected;
        request.RejectedAt = now;
        request.RejectedBy = actor;
        request.RejectReason = reason;
        request.UpdatedAt = now;
        request.AuditLog.Add(new RecoveryAuditEntry { At = now, Actor = actor, Action = "rejected", Details = reason });

        await _requests.ReplaceOneAsync(r => r.Id == request.Id, request);
        await _mail.SendRequestRejectedAsync(request);

        var detail = MapDetail(request);
        detail.Account = await BuildAccountSnapshotAsync(request);
        return detail;
    }

    public async Task<RecoveryRequestDetailDto> ExecuteAsync(string id, string actor)
    {
        var request = await GetByIdAsync(id);
        EnsureStatus(request, RecoveryRequestStatus.Approved);
        if (request.ExecuteAfter == null || DateTime.UtcNow < request.ExecuteAfter)
        {
            throw new RecoveryRequestException($"Waiting period is not over yet (until {request.ExecuteAfter:u} UTC).", 409);
        }
        if (request.ResolvedUserId == null)
        {
            throw new RecoveryRequestException("Account not found in Keycloak.", 409);
        }

        // Сброс второго фактора: удаляем otp и recovery-коды, выкидываем все сессии,
        // отправляем письмо Keycloak со сбросом пароля (UPDATE_PASSWORD).
        var credentials = await _keycloak.GetUserCredentialsAsync(request.ResolvedUserId);
        var secondFactor = credentials
            .Where(c => (c.Type.Equals("otp", StringComparison.OrdinalIgnoreCase) ||
                         c.Type.Equals("recovery-authn-codes", StringComparison.OrdinalIgnoreCase)) &&
                        !string.IsNullOrWhiteSpace(c.Id))
            .ToList();
        foreach (var credential in secondFactor)
        {
            await _keycloak.DeleteCredentialAsync(request.ResolvedUserId, credential.Id);
        }
        await _keycloak.LogoutAllSessionsAsync(request.ResolvedUserId);
        await _keycloak.ExecuteActionsEmailAsync(
            request.ResolvedUserId,
            new[] { "UPDATE_PASSWORD" },
            _configuration["Keycloak:Admin:SecurityRedirectUri"],
            _configuration["Keycloak:Admin:PublicClientId"]);

        var now = DateTime.UtcNow;
        request.Status = RecoveryRequestStatus.Executed;
        request.ExecutedAt = now;
        request.ExecutedBy = actor;
        request.UpdatedAt = now;
        request.AuditLog.Add(new RecoveryAuditEntry { At = now, Actor = actor, Action = "executed", Details = $"removed {secondFactor.Count} second-factor credential(s)" });

        await _requests.ReplaceOneAsync(r => r.Id == request.Id, request);
        await _mail.SendRequestExecutedAsync(request);

        var detail = MapDetail(request);
        detail.Account = await BuildAccountSnapshotAsync(request);
        return detail;
    }

    // ---- внутренности ----

    private async Task<RecoveryRequest?> FindActiveByUserAsync(string userId)
    {
        var filter = Builders<RecoveryRequest>.Filter.Eq(r => r.ResolvedUserId, userId) &
                     Builders<RecoveryRequest>.Filter.In(r => r.Status, new[] { RecoveryRequestStatus.Pending, RecoveryRequestStatus.Approved });
        return await _requests.Find(filter).SortByDescending(r => r.CreatedAt).FirstOrDefaultAsync();
    }

    private async Task CancelAsync(RecoveryRequest request, string source)
    {
        var now = DateTime.UtcNow;
        request.Status = RecoveryRequestStatus.Cancelled;
        request.CancelledAt = now;
        request.CancelSource = source;
        request.UpdatedAt = now;
        request.AuditLog.Add(new RecoveryAuditEntry { At = now, Actor = "account-owner", Action = "cancelled", Details = source });
        await _requests.ReplaceOneAsync(r => r.Id == request.Id, request);
        await _mail.SendRequestCancelledAsync(request);
    }

    private async Task<RecoveryRequest> GetByIdAsync(string id)
    {
        var request = await _requests.Find(r => r.Id == id).FirstOrDefaultAsync();
        if (request == null)
        {
            throw new RecoveryRequestException("Recovery request not found.", 404);
        }
        return request;
    }

    private static void EnsureStatus(RecoveryRequest request, RecoveryRequestStatus expected)
    {
        if (request.Status != expected)
        {
            throw new RecoveryRequestException($"Request is {request.Status}, expected {expected}.", 409);
        }
    }

    private async Task<RecoveryAccountSnapshotDto> BuildAccountSnapshotAsync(RecoveryRequest request)
    {
        var snapshot = new RecoveryAccountSnapshotDto { Found = request.ResolvedUserId != null };
        if (request.ResolvedUserId == null)
        {
            return snapshot;
        }

        var user = await _keycloak.GetUserAsync(request.ResolvedUserId);
        if (user == null)
        {
            snapshot.Found = false;
            return snapshot;
        }

        snapshot.UserId = user.Id;
        snapshot.Username = user.Username;
        snapshot.Email = user.Email;
        snapshot.EmailVerified = user.EmailVerified;
        snapshot.Enabled = user.Enabled;
        snapshot.AccountCreatedAt = user.CreatedTimestamp is { } created
            ? DateTimeOffset.FromUnixTimeMilliseconds(created).UtcDateTime
            : null;

        var credentials = await _keycloak.GetUserCredentialsAsync(user.Id);
        snapshot.TwoFactorEnabled = credentials.Any(c => c.Type.Equals("otp", StringComparison.OrdinalIgnoreCase));
        var recovery = credentials.FirstOrDefault(c => c.Type.Equals("recovery-authn-codes", StringComparison.OrdinalIgnoreCase));
        snapshot.BackupCodesGenerated = recovery != null;
        if (!string.IsNullOrWhiteSpace(recovery?.CredentialData))
        {
            try
            {
                using var data = System.Text.Json.JsonDocument.Parse(recovery.CredentialData);
                if (data.RootElement.TryGetProperty("remainingCodes", out var remaining) && remaining.TryGetInt32(out var value))
                {
                    snapshot.BackupCodesRemaining = value;
                }
            }
            catch (System.Text.Json.JsonException)
            {
            }
        }

        var sessions = await _keycloak.GetUserSessionsAsync(user.Id);
        snapshot.ActiveSessions = sessions.Select(s => new RecoverySessionDto
        {
            IpAddress = s.IpAddress,
            Start = DateTimeOffset.FromUnixTimeMilliseconds(s.Start).UtcDateTime,
            LastAccess = DateTimeOffset.FromUnixTimeMilliseconds(s.LastAccess).UtcDateTime
        }).ToList();

        try
        {
            var events = await _keycloak.GetUserLoginEventsAsync(user.Id, 25);
            snapshot.LoginEvents = events.Select(e => new RecoveryLoginEventDto
            {
                Time = DateTimeOffset.FromUnixTimeMilliseconds(e.Time).UtcDateTime,
                Type = e.Type,
                IpAddress = e.IpAddress,
                ClientId = e.ClientId
            }).ToList();
        }
        catch (Exception ex)
        {
            // Скорее всего у сервисного аккаунта нет роли view-events — карточка не должна падать целиком.
            _logger.LogWarning(ex, "Failed to load login events for recovery card");
            snapshot.LoginEventsError = "Login events unavailable (service account needs the view-events role).";
        }

        try
        {
            var orders = await _orders.GetOrdersByUserAsync(user.Username);
            snapshot.RecentOrders = orders
                .OrderByDescending(o => o.CreatedAt)
                .Take(10)
                .Select(o => new RecoveryOrderDto
                {
                    OrderNumber = o.OrderNumber,
                    GameName = o.GameName,
                    TotalAmount = o.TotalAmount ?? o.Totals?.Total,
                    Currency = o.Currency,
                    IsPaid = o.IsPaid,
                    CreatedAt = o.CreatedAt
                })
                .ToList();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load orders for recovery card");
        }

        return snapshot;
    }

    private static RecoveryRequestDetailDto MapDetail(RecoveryRequest request) => new()
    {
        Id = request.Id,
        PublicId = request.PublicId,
        Status = request.Status.ToString(),
        AccountEmail = request.AccountEmail,
        ContactEmail = request.ContactEmail,
        ClaimedOrderNumbers = request.ClaimedOrderNumbers,
        ClaimedCardLast4 = request.ClaimedCardLast4,
        Message = request.Message,
        RequestIp = request.RequestIp,
        RequestUserAgent = request.RequestUserAgent,
        CreatedAt = request.CreatedAt,
        UpdatedAt = request.UpdatedAt,
        ApprovedAt = request.ApprovedAt,
        ApprovedBy = request.ApprovedBy,
        ExecuteAfter = request.ExecuteAfter,
        ExecutedAt = request.ExecutedAt,
        ExecutedBy = request.ExecutedBy,
        RejectedAt = request.RejectedAt,
        RejectedBy = request.RejectedBy,
        RejectReason = request.RejectReason,
        CancelledAt = request.CancelledAt,
        CancelSource = request.CancelSource,
        Checklist = request.Checklist.Select(c => new RecoveryChecklistItemDto { Key = c.Key, Label = c.Label, Passed = c.Passed }).ToList(),
        AuditLog = request.AuditLog.Select(a => new RecoveryAuditEntryDto { At = a.At, Actor = a.Actor, Action = a.Action, Details = a.Details }).ToList()
    };
}
