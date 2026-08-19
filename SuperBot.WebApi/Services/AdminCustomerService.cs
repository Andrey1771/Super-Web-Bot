using MongoDB.Driver;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;
using SuperBot.WebApi.Support.Chat.Models;
using SuperBot.WebApi.Support.Models;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Карточка клиента для специалиста: кто это, что покупал, о чём писал.
///
/// Раньше пункт «Users» в админке показывал лог входов Keycloak (auth_method, redirect_uri…) —
/// специалисту, к которому пришёл клиент, смотреть там было нечего. Здесь всё собирается по
/// одному ключу — почте: заказы (UserName), ключи (UserId), тикеты (UserEmail), чаты (Email),
/// промокоды (UserName) хранят её каждый под своим именем поля, но это одна и та же строка.
///
/// Профиль — из Keycloak; всё остальное — из Mongo. Keycloak недоступен — карточка всё равно
/// собирается по локальным данным, просто без статуса учётки: заказы важнее, чем «включён ли».
/// </summary>
public sealed class AdminCustomerService
{
    private readonly KeycloakAdminClient _keycloak;
    private readonly IOrderRepository _orders;
    private readonly IGameKeyRepository _keys;
    private readonly IMongoDatabase _database;
    private readonly ILogger<AdminCustomerService> _logger;

    public AdminCustomerService(
        KeycloakAdminClient keycloak,
        IOrderRepository orders,
        IGameKeyRepository keys,
        IMongoDatabase database,
        ILogger<AdminCustomerService> logger)
    {
        _keycloak = keycloak;
        _orders = orders;
        _keys = keys;
        _database = database;
        _logger = logger;
    }

    // ---------- поиск ----------

    /// <summary>
    /// Поиск клиентов. Идёт и в Keycloak, и по заказам: гость без учётки в Keycloak не значится,
    /// но заказы у него есть — и специалист ищет именно его.
    /// </summary>
    public async Task<IReadOnlyList<CustomerSearchHitDto>> SearchAsync(string query, CancellationToken ct)
    {
        var q = (query ?? string.Empty).Trim();
        if (q.Length < 2)
        {
            return Array.Empty<CustomerSearchHitDto>();
        }

        var hits = new Dictionary<string, CustomerSearchHitDto>(StringComparer.OrdinalIgnoreCase);

        try
        {
            foreach (var user in await _keycloak.SearchUsersAsync(q, 20))
            {
                if (string.IsNullOrWhiteSpace(user.Email))
                {
                    continue;
                }
                hits[user.Email] = new CustomerSearchHitDto
                {
                    Email = user.Email,
                    Name = FullName(user.FirstName, user.LastName),
                    KeycloakId = user.Id,
                    Enabled = user.Enabled,
                    Source = "account"
                };
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Customer search: Keycloak unavailable, falling back to orders only.");
        }

        // Гости и старые заказы: почта есть только в Orders.UserName.
        var orders = _database.GetCollection<OrderDb>("Orders");
        var regex = new MongoDB.Bson.BsonRegularExpression(System.Text.RegularExpressions.Regex.Escape(q), "i");
        var byOrders = await orders
            .Find(Builders<OrderDb>.Filter.Regex(o => o.UserName, regex))
            .Project(o => o.UserName)
            .Limit(200)
            .ToListAsync(ct);

        foreach (var email in byOrders.Where(e => !string.IsNullOrWhiteSpace(e)).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (!hits.ContainsKey(email))
            {
                hits[email] = new CustomerSearchHitDto { Email = email, Source = "guest" };
            }
        }

        // Счётчик заказов на каждого — чтобы в списке было видно, кто покупатель, а кто заглянул.
        var emails = hits.Keys.ToList();
        if (emails.Count > 0)
        {
            var counts = await orders.Aggregate()
                .Match(Builders<OrderDb>.Filter.In(o => o.UserName, emails))
                .Group(o => o.UserName, g => new { Email = g.Key, Count = g.Count() })
                .ToListAsync(ct);
            foreach (var c in counts)
            {
                if (hits.TryGetValue(c.Email, out var hit))
                {
                    hit.OrderCount = c.Count;
                }
            }
        }

        return hits.Values
            .OrderByDescending(h => h.OrderCount)
            .ThenBy(h => h.Email, StringComparer.OrdinalIgnoreCase)
            .Take(30)
            .ToList();
    }

    // ---------- карточка ----------

    public async Task<CustomerCardDto?> GetAsync(string email, CancellationToken ct)
    {
        var normalized = (email ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        var card = new CustomerCardDto { Email = normalized };

        // Профиль из Keycloak — best effort.
        try
        {
            var user = await _keycloak.FindUserByEmailAsync(normalized);
            if (user is not null)
            {
                card.KeycloakId = user.Id;
                card.Name = FullName(user.FirstName, user.LastName);
                card.Enabled = user.Enabled;
                card.EmailVerified = user.EmailVerified;
                card.RegisteredAt = user.CreatedTimestamp is > 0
                    ? DateTimeOffset.FromUnixTimeMilliseconds(user.CreatedTimestamp.Value).UtcDateTime
                    : null;

                try
                {
                    var logins = await _keycloak.GetUserLoginEventsAsync(user.Id, 1);
                    var last = logins.OrderByDescending(e => e.Time).FirstOrDefault();
                    card.LastLoginAt = last is null ? null : DateTimeOffset.FromUnixTimeMilliseconds(last.Time).UtcDateTime;
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "Customer card: login events unavailable for {Email}.", normalized);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Customer card: Keycloak lookup failed for {Email}.", normalized);
            card.ProfileUnavailable = true;
        }

        // Заказы.
        var orders = (await _orders.GetOrdersByUserAsync(normalized))
            .OrderByDescending(o => o.OrderDate)
            .ToList();
        card.OrderCount = orders.Count;
        card.PaidOrderCount = orders.Count(o => o.IsPaid);
        // Сумма — по валютам отдельно: складывать доллары со звёздами нельзя.
        card.SpentByCurrency = orders
            .Where(o => o.IsPaid && !string.Equals(o.Status, "REFUNDED", StringComparison.OrdinalIgnoreCase))
            .GroupBy(o => string.IsNullOrWhiteSpace(o.Currency) ? "USD" : o.Currency!.ToUpperInvariant())
            .ToDictionary(g => g.Key, g => g.Sum(o => o.Totals?.Total > 0 ? o.Totals.Total : o.TotalAmount ?? 0m));
        card.FirstOrderAt = orders.LastOrDefault()?.OrderDate;
        card.LastOrderAt = orders.FirstOrDefault()?.OrderDate;
        card.RecentOrders = orders.Take(10).Select(o => new CustomerOrderDto
        {
            Id = o.Id.ToString(),
            Number = string.IsNullOrWhiteSpace(o.OrderNumber) ? o.Id.ToString() : o.OrderNumber!,
            CreatedAt = o.OrderDate,
            Status = o.Status ?? (o.IsPaid ? (o.IsFulfilled ? "DELIVERED" : "PAID") : "PENDING"),
            Total = o.Totals?.Total > 0 ? o.Totals.Total : o.TotalAmount ?? 0m,
            Currency = string.IsNullOrWhiteSpace(o.Currency) ? "USD" : o.Currency!,
            Items = (o.Items?.Count > 0
                ? o.Items.Select(i => i.Title)
                : new[] { o.GameName }).Where(t => !string.IsNullOrWhiteSpace(t)).ToList()
        }).ToList();
        card.RefundedOrderCount = orders.Count(o => string.Equals(o.Status, "REFUNDED", StringComparison.OrdinalIgnoreCase));

        // Ключи — только счётчик и последние: сами значения специалисту не нужны.
        var keys = await _keys.GetByUserAsync(normalized, 100);
        card.KeyCount = keys.Count;
        card.RecentKeys = keys.Take(10).Select(k => new CustomerKeyDto
        {
            GameId = k.GameId,
            KeyType = k.KeyType,
            IssuedAt = k.IssuedAt,
            Masked = Mask(k.Key)
        }).ToList();

        // Тикеты и чаты.
        var tickets = _database.GetCollection<SupportTicket>("SupportTickets");
        var ticketList = await tickets.Find(t => t.UserEmail == normalized)
            .SortByDescending(t => t.LastMessageAt)
            .Limit(10)
            .ToListAsync(ct);
        card.TicketCount = (int)await tickets.CountDocumentsAsync(t => t.UserEmail == normalized, cancellationToken: ct);
        card.RecentTickets = ticketList.Select(t => new CustomerTicketDto
        {
            Id = t.Id,
            PublicId = t.PublicId,
            Subject = t.Subject,
            Status = t.Status.ToString(),
            LastMessageAt = t.LastMessageAt
        }).ToList();

        var chats = _database.GetCollection<ChatSession>("SupportChatSessions");
        var chatList = await chats.Find(c => c.Email == normalized)
            .SortByDescending(c => c.LastMessageAt)
            .Limit(10)
            .ToListAsync(ct);
        card.ChatCount = (int)await chats.CountDocumentsAsync(c => c.Email == normalized, cancellationToken: ct);
        card.RecentChats = chatList.Select(c => new CustomerChatDto
        {
            Id = c.Id,
            Status = c.Status.ToString().ToLowerInvariant(),
            LastMessageAt = c.LastMessageAt ?? c.UpdatedAt,
            Summary = c.Summary
        }).ToList();

        // Промокоды.
        var usages = _database.GetCollection<PromoCodeUsageDb>("PromoCodeUsages");
        card.PromoCodesUsed = (await usages.Find(u => u.UserName == normalized)
                .SortByDescending(u => u.UsedAt)
                .Limit(20)
                .ToListAsync(ct))
            .Select(u => u.Code)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        // Пустая карточка (ни учётки, ни заказов, ни обращений) — значит, такого клиента нет.
        var known = card.KeycloakId is not null || card.OrderCount > 0 || card.TicketCount > 0 || card.ChatCount > 0;
        return known ? card : null;
    }

    // ---------- действия ----------

    public async Task<ActionOutcome> SetEnabledAsync(string email, bool enabled)
    {
        var user = await _keycloak.FindUserByEmailAsync(email);
        if (user is null)
        {
            return ActionOutcome.Refuse("This customer has no account in Keycloak (guest) — nothing to block.");
        }
        if (user.Enabled == enabled)
        {
            return ActionOutcome.Refuse(enabled ? "Account is already enabled." : "Account is already blocked.");
        }

        await _keycloak.SetEnabledAsync(user.Id, enabled);
        if (!enabled)
        {
            // Заблокировали — выкидываем из всех сессий, иначе открытые вкладки живут до истечения токена.
            try
            {
                await _keycloak.LogoutAllSessionsAsync(user.Id);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Customer block: logout of sessions failed for {Email}.", email);
            }
        }
        return ActionOutcome.Ok(enabled ? "Account enabled." : "Account blocked and signed out everywhere.");
    }

    public async Task<ActionOutcome> SendPasswordResetAsync(string email)
    {
        var user = await _keycloak.FindUserByEmailAsync(email);
        if (user is null)
        {
            return ActionOutcome.Refuse("This customer has no account in Keycloak (guest) — there is no password to reset.");
        }
        await _keycloak.ExecuteActionsEmailAsync(user.Id, new[] { "UPDATE_PASSWORD" });
        return ActionOutcome.Ok($"Password reset e-mail sent to {email}.");
    }

    // ---------- helpers ----------

    private static string? FullName(string? first, string? last)
    {
        var name = $"{first} {last}".Trim();
        return string.IsNullOrWhiteSpace(name) ? null : name;
    }

    private static string Mask(string? key)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            return string.Empty;
        }
        var t = key.Trim();
        return t.Length <= 4 ? new string('•', t.Length) : new string('•', t.Length - 4) + t[^4..];
    }
}

// ---------- DTO ----------

public sealed class CustomerSearchHitDto
{
    public string Email { get; set; } = string.Empty;
    public string? Name { get; set; }
    public string? KeycloakId { get; set; }
    public bool? Enabled { get; set; }
    /// <summary>account — есть учётка в Keycloak; guest — только заказы.</summary>
    public string Source { get; set; } = "guest";
    public int OrderCount { get; set; }
}

public sealed class CustomerCardDto
{
    public string Email { get; set; } = string.Empty;
    public string? Name { get; set; }
    public string? KeycloakId { get; set; }
    public bool? Enabled { get; set; }
    public bool? EmailVerified { get; set; }
    public bool ProfileUnavailable { get; set; }
    public DateTime? RegisteredAt { get; set; }
    public DateTime? LastLoginAt { get; set; }

    public int OrderCount { get; set; }
    public int PaidOrderCount { get; set; }
    public int RefundedOrderCount { get; set; }
    public Dictionary<string, decimal> SpentByCurrency { get; set; } = new();
    public DateTime? FirstOrderAt { get; set; }
    public DateTime? LastOrderAt { get; set; }
    public List<CustomerOrderDto> RecentOrders { get; set; } = new();

    public int KeyCount { get; set; }
    public List<CustomerKeyDto> RecentKeys { get; set; } = new();

    public int TicketCount { get; set; }
    public List<CustomerTicketDto> RecentTickets { get; set; } = new();
    public int ChatCount { get; set; }
    public List<CustomerChatDto> RecentChats { get; set; } = new();

    public List<string> PromoCodesUsed { get; set; } = new();
}

public sealed class CustomerOrderDto
{
    public string Id { get; set; } = string.Empty;
    public string Number { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public string Status { get; set; } = string.Empty;
    public decimal Total { get; set; }
    public string Currency { get; set; } = "USD";
    public List<string> Items { get; set; } = new();
}

public sealed class CustomerKeyDto
{
    public string GameId { get; set; } = string.Empty;
    public string? KeyType { get; set; }
    public DateTime IssuedAt { get; set; }
    public string Masked { get; set; } = string.Empty;
}

public sealed class CustomerTicketDto
{
    public string Id { get; set; } = string.Empty;
    public string PublicId { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime LastMessageAt { get; set; }
}

public sealed class CustomerChatDto
{
    public string Id { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime LastMessageAt { get; set; }
    public string? Summary { get; set; }
}
