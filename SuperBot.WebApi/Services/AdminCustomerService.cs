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
    /// <summary>Сколько клиентов показывать без запроса — столько же, сколько отдаёт поиск.</summary>
    private const int DefaultListSize = 30;

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

        // Пустой запрос обслуживает BrowseAsync: там постраничный обход по индексу, а не
        // поиск. Здесь возвращаем пусто, чтобы случайный запрос без слова не собирал список.
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
        //
        // Ищем подстроку где угодно — «ova» находит petrova@…, как и ждёт человек. Раньше
        // такой запрос читал коллекцию целиком, поэтому его пришлось сузить до начала
        // строки; после появления индекса ix_orders_user_name это больше не нужно:
        // вместе с проекцией одного поля запрос обслуживается ОДНИМ индексом, документы
        // не читаются вовсе (PROJECTION_COVERED — проверено планом на живой базе).
        // Проекция здесь не украшение, а условие дешевизны: без неё Mongo пойдёт за
        // документами и вернётся к перебору.
        var orders = _database.GetCollection<OrderDb>("Orders");
        var infix = new MongoDB.Bson.BsonRegularExpression(System.Text.RegularExpressions.Regex.Escape(q), "i");
        var byOrders = await orders
            .Find(Builders<OrderDb>.Filter.Regex(o => o.UserName, infix))
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

    /// <summary>
    /// Обход клиентов окнами — для таблицы, которую листают. Срез выбирает, кого показывать:
    ///
    ///  • all      — все покупатели, по алфавиту почты; продолжение по индексу ix_orders_user_name,
    ///               стоимость окна не растёт по мере прокрутки;
    ///  • recent   — по дате последнего заказа, свежие сверху. Требует сгруппировать все заказы,
    ///               поэтому дороже остальных; при тысячах клиентов этому срезу понадобится
    ///               отдельная витрина покупателей, обновляемая при заказе;
    ///  • refunded — у кого были возвраты или споры;
    ///  • blocked  — заблокированные учётки (из Keycloak);
    ///  • no_orders — учётки без единого заказа: зарегистрировался, но не купил.
    /// </summary>
    public async Task<CustomerBrowsePageDto> BrowseAsync(string? filter, string? after, int limit, CancellationToken ct)
    {
        var size = Math.Clamp(limit, 1, 200);
        return (filter ?? "all").Trim().ToLowerInvariant() switch
        {
            "recent" => await BrowseByLastOrderAsync(after, size, ct),
            "refunded" => await BrowseRefundedAsync(after, size, ct),
            "blocked" => await BrowseAccountsAsync(after, size, enabledFilter: false, withoutOrders: false, ct),
            "no_orders" => await BrowseAccountsAsync(after, size, enabledFilter: null, withoutOrders: true, ct),
            _ => await BrowseAllBuyersAsync(after, size, ct),
        };
    }

    /// <summary>Все покупатели по алфавиту. Продолжение — почта последней строки, читается один индекс.</summary>
    private async Task<CustomerBrowsePageDto> BrowseAllBuyersAsync(string? after, int size, CancellationToken ct)
    {
        var orders = _database.GetCollection<OrderDb>("Orders");

        var emails = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var cursor = string.IsNullOrWhiteSpace(after) ? null : after.Trim();

        // У одного покупателя много заказов, а нужны разные почты — читаем индекс окнами,
        // пока не наберём нужное количество. Сами документы не трогаем.
        while (emails.Count < size)
        {
            var filter = cursor == null
                ? Builders<OrderDb>.Filter.Ne(order => order.UserName, null)
                : Builders<OrderDb>.Filter.Gt(order => order.UserName, cursor);

            var batch = await orders
                .Find(filter)
                .Project(order => order.UserName)
                .Sort(Builders<OrderDb>.Sort.Ascending(order => order.UserName))
                .Limit(size * 5)
                .ToListAsync(ct);

            if (batch.Count == 0)
            {
                break;
            }

            foreach (var email in batch)
            {
                if (!string.IsNullOrWhiteSpace(email) && seen.Add(email))
                {
                    emails.Add(email);
                    if (emails.Count >= size)
                    {
                        break;
                    }
                }
            }

            cursor = batch[^1];

            if (batch.Count < size * 5)
            {
                break;
            }
        }

        var items = await AttachOrderStatsAsync(emails, ct);

        // Первое окно — заодно считаем, сколько всего покупателей в срезе. Distinct идёт
        // по индексу ix_orders_user_name, документы при этом не читаются.
        long? total = null;
        if (string.IsNullOrWhiteSpace(after))
        {
            var distinct = await orders.DistinctAsync(order => order.UserName, Builders<OrderDb>.Filter.Ne(order => order.UserName, null), cancellationToken: ct);
            var all = await distinct.ToListAsync(ct);
            total = all.Count(email => !string.IsNullOrWhiteSpace(email));
        }

        return new CustomerBrowsePageDto
        {
            Items = items,
            Total = total,
            NextCursor = emails.Count >= size ? emails[^1] : null
        };
    }

    /// <summary>
    /// По дате последнего заказа, свежие сверху. Группирует все заказы — это честная цена
    /// такой сортировки без отдельной витрины; продолжение здесь по смещению, потому что
    /// дата не даёт устойчивой точки (два заказа в одну секунду).
    /// </summary>
    private async Task<CustomerBrowsePageDto> BrowseByLastOrderAsync(string? after, int size, CancellationToken ct)
    {
        var offset = int.TryParse(after, out var parsed) && parsed > 0 ? parsed : 0;
        var orders = _database.GetCollection<OrderDb>("Orders");

        var rows = await orders.Aggregate(new AggregateOptions { AllowDiskUse = true })
            .Group(order => order.UserName, group => new
            {
                Email = group.Key,
                Count = group.Count(),
                LastOrder = group.Max(order => order.CreatedAt)
            })
            .SortByDescending(row => row.LastOrder)
            .Skip(offset)
            .Limit(size)
            .ToListAsync(ct);

        var items = rows
            .Where(row => !string.IsNullOrWhiteSpace(row.Email))
            .Select(row => new CustomerSearchHitDto
            {
                Email = row.Email,
                OrderCount = row.Count,
                LastOrderAt = row.LastOrder == default ? null : row.LastOrder,
                Source = "guest"
            })
            .ToList();

        return new CustomerBrowsePageDto
        {
            Items = items,
            NextCursor = rows.Count >= size ? (offset + size).ToString() : null
        };
    }

    /// <summary>Покупатели с возвратами или спорами — по алфавиту, продолжение по почте.</summary>
    private async Task<CustomerBrowsePageDto> BrowseRefundedAsync(string? after, int size, CancellationToken ct)
    {
        var orders = _database.GetCollection<OrderDb>("Orders");

        var refunded = Builders<OrderDb>.Filter.Or(
            Builders<OrderDb>.Filter.Gt(order => order.RefundedAmount, 0m),
            Builders<OrderDb>.Filter.In(order => order.Status,
                new[] { "REFUNDED", "PARTIALLY_REFUNDED", "REFUND_PENDING", "DISPUTED", "DISPUTE_LOST" }));

        var match = string.IsNullOrWhiteSpace(after)
            ? refunded
            : Builders<OrderDb>.Filter.And(refunded, Builders<OrderDb>.Filter.Gt(order => order.UserName, after.Trim()));

        var rows = await orders.Aggregate()
            .Match(match)
            .Group(order => order.UserName, group => new
            {
                Email = group.Key,
                Count = group.Count(),
                LastOrder = group.Max(order => order.CreatedAt)
            })
            .SortBy(row => row.Email)
            .Limit(size)
            .ToListAsync(ct);

        var items = rows
            .Where(row => !string.IsNullOrWhiteSpace(row.Email))
            .Select(row => new CustomerSearchHitDto
            {
                Email = row.Email,
                OrderCount = row.Count,
                LastOrderAt = row.LastOrder == default ? null : row.LastOrder,
                Source = "guest"
            })
            .ToList();

        return new CustomerBrowsePageDto
        {
            Items = items,
            NextCursor = rows.Count >= size ? rows[^1].Email : null
        };
    }

    /// <summary>
    /// Срезы по учёткам Keycloak: заблокированные и «зарегистрировался, но не купил».
    /// Продолжение — смещение в списке учёток; для второго среза окно добирается циклом,
    /// потому что после вычёркивания покупателей от страницы может остаться меньше окна.
    /// </summary>
    private async Task<CustomerBrowsePageDto> BrowseAccountsAsync(
        string? after, int size, bool? enabledFilter, bool withoutOrders, CancellationToken ct)
    {
        var offset = int.TryParse(after, out var parsed) && parsed > 0 ? parsed : 0;
        var orders = _database.GetCollection<OrderDb>("Orders");
        var items = new List<CustomerSearchHitDto>();
        var moreLeft = false;

        while (items.Count < size)
        {
            var fetch = withoutOrders ? size * 3 : size;
            List<KeycloakUser> chunk;
            try
            {
                chunk = await _keycloak.ListUsersAsync(offset, fetch, enabledFilter);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Customer browse: Keycloak unavailable, accounts filter returns nothing.");
                break;
            }

            if (chunk.Count == 0)
            {
                break;
            }

            offset += chunk.Count;
            moreLeft = chunk.Count >= fetch;

            var withEmail = chunk.Where(user => !string.IsNullOrWhiteSpace(user.Email)).ToList();
            var emails = withEmail.Select(user => user.Email).ToList();

            var buyers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var counts = new Dictionary<string, (int Count, DateTime Last)>(StringComparer.OrdinalIgnoreCase);
            if (emails.Count > 0)
            {
                var stats = await orders.Aggregate()
                    .Match(Builders<OrderDb>.Filter.In(order => order.UserName, emails))
                    .Group(order => order.UserName, group => new
                    {
                        Email = group.Key,
                        Count = group.Count(),
                        LastOrder = group.Max(order => order.CreatedAt)
                    })
                    .ToListAsync(ct);
                foreach (var row in stats.Where(row => row.Email != null))
                {
                    buyers.Add(row.Email);
                    counts[row.Email] = (row.Count, row.LastOrder);
                }
            }

            foreach (var user in withEmail)
            {
                if (withoutOrders && buyers.Contains(user.Email))
                {
                    continue;
                }

                items.Add(new CustomerSearchHitDto
                {
                    Email = user.Email,
                    Name = FullName(user.FirstName, user.LastName),
                    KeycloakId = user.Id,
                    Enabled = user.Enabled,
                    Source = "account",
                    OrderCount = counts.TryGetValue(user.Email, out var stat) ? stat.Count : 0,
                    LastOrderAt = counts.TryGetValue(user.Email, out var stat2) && stat2.Last != default ? stat2.Last : null
                });

                if (items.Count >= size)
                {
                    break;
                }
            }

            if (!moreLeft)
            {
                break;
            }
        }

        return new CustomerBrowsePageDto
        {
            Items = items,
            NextCursor = moreLeft ? offset.ToString() : null
        };
    }

    /// <summary>Счётчик и дата последнего заказа для набора почт — одним запросом на окно.</summary>
    private async Task<List<CustomerSearchHitDto>> AttachOrderStatsAsync(List<string> emails, CancellationToken ct)
    {
        var hits = emails.ToDictionary(
            email => email,
            email => new CustomerSearchHitDto { Email = email, Source = "guest" },
            StringComparer.OrdinalIgnoreCase);

        if (emails.Count > 0)
        {
            var orders = _database.GetCollection<OrderDb>("Orders");
            var stats = await orders.Aggregate()
                .Match(Builders<OrderDb>.Filter.In(order => order.UserName, emails))
                .Group(order => order.UserName, group => new
                {
                    Email = group.Key,
                    Count = group.Count(),
                    LastOrder = group.Max(order => order.CreatedAt)
                })
                .ToListAsync(ct);

            foreach (var row in stats)
            {
                if (row.Email != null && hits.TryGetValue(row.Email, out var hit))
                {
                    hit.OrderCount = row.Count;
                    hit.LastOrderAt = row.LastOrder == default ? null : row.LastOrder;
                }
            }
        }

        return hits.Values.OrderBy(hit => hit.Email, StringComparer.Ordinal).ToList();
    }

    /// <summary>
    /// Выгрузка текущего среза в CSV — то, что видно в таблице, но целиком, а не по окнам.
    /// Потолок строк защищает и сервер, и того, кто откроет файл; про срез он честно
    /// сообщается последней строкой файла.
    /// </summary>
    public async Task<string> ExportCsvAsync(string? filter, string? query, CancellationToken ct)
    {
        const int exportLimit = 5000;
        var rows = new List<CustomerSearchHitDto>();
        var q = (query ?? string.Empty).Trim();

        if (q.Length >= 2)
        {
            rows.AddRange(await SearchAsync(q, ct));
        }
        else
        {
            string? cursor = null;
            while (rows.Count < exportLimit)
            {
                var page = await BrowseAsync(filter, cursor, 200, ct);
                rows.AddRange(page.Items);
                if (page.NextCursor == null)
                {
                    break;
                }
                cursor = page.NextCursor;
            }
        }

        var truncated = rows.Count > exportLimit;
        if (truncated)
        {
            rows = rows.Take(exportLimit).ToList();
        }

        static string Cell(string? value)
        {
            var v = value ?? string.Empty;
            return v.Contains(',') || v.Contains('"') || v.Contains('\n')
                ? '"' + v.Replace("\"", "\"\"") + '"'
                : v;
        }

        var sb = new System.Text.StringBuilder();
        sb.AppendLine("Email,Name,Orders,LastOrder,Account");
        foreach (var row in rows)
        {
            var account = row.Source == "account"
                ? (row.Enabled == false ? "blocked" : "account")
                : "guest";
            sb.AppendLine(string.Join(",",
                Cell(row.Email),
                Cell(row.Name),
                row.OrderCount.ToString(),
                row.LastOrderAt?.ToString("yyyy-MM-dd") ?? "",
                account));
        }
        if (truncated)
        {
            sb.AppendLine($"# truncated to first {exportLimit} rows");
        }

        return sb.ToString();
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

    /// <summary>Роль, дающая доступ в админку магазина. Её носителей бережём от блокировки.</summary>
    private const string AdminRole = "admin";

    /// <summary>
    /// Блокировка и разблокировка учётки. actorEmail — кто нажал: без него нельзя отличить
    /// «заблокировать покупателя» от «заблокировать себя».
    /// </summary>
    public async Task<ActionOutcome> SetEnabledAsync(string email, bool enabled, string? actorEmail = null)
    {
        // Проверка на себя — до всяких запросов в Keycloak: она не зависит от того, жив ли он,
        // а последствия у ошибки самые тяжёлые. Заблокировав себя, человек через пять минут
        // (время жизни токена) теряет админку, а кнопка «Unblock» живёт внутри неё же.
        if (!enabled
            && !string.IsNullOrWhiteSpace(actorEmail)
            && string.Equals(actorEmail.Trim(), email.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            return ActionOutcome.Refuse("You cannot block your own account — you would lock yourself out of the admin panel.");
        }

        var user = await _keycloak.FindUserByEmailAsync(email);
        if (user is null)
        {
            return ActionOutcome.Refuse("This customer has no account in Keycloak (guest) — nothing to block.");
        }
        if (user.Enabled == enabled)
        {
            return ActionOutcome.Refuse(enabled ? "Account is already enabled." : "Account is already blocked.");
        }

        if (!enabled)
        {
            var refusal = await RefuseIfLastAdministratorAsync(user);
            if (refusal != null)
            {
                return refusal;
            }
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

    /// <summary>
    /// Не даём заблокировать администратора, если это последний, кто может войти в админку.
    ///
    /// Ситуация «заблокированы все админы» изнутри магазина непоправима: разблокировать
    /// некому, остаётся консоль Keycloak. Поэтому при любой неясности — отказ: не смогли
    /// посмотреть список администраторов, значит не знаем, останется ли кто-то кроме этого.
    /// </summary>
    private async Task<ActionOutcome?> RefuseIfLastAdministratorAsync(KeycloakUser user)
    {
        List<string> roles;
        try
        {
            roles = await _keycloak.GetRealmRolesAsync(user.Id);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Customer block: could not read roles of {Email}, blocking refused.", user.Email);
            return ActionOutcome.Fail("Could not check the account's roles in Keycloak — blocking is refused until it answers.");
        }

        if (!roles.Contains(AdminRole, StringComparer.OrdinalIgnoreCase))
        {
            return null;
        }

        var admins = await _keycloak.TryGetRealmRoleUsersAsync(AdminRole);
        var otherActiveAdmins = admins?
            .Count(other => other.Enabled
                            && !string.Equals(other.Id, user.Id, StringComparison.OrdinalIgnoreCase));

        if (otherActiveAdmins is > 0)
        {
            return null;
        }

        return ActionOutcome.Refuse(admins == null
            ? "This is an administrator account, and the list of administrators is not available — blocking it could lock everyone out of the admin panel. Do it in the Keycloak console if you really need to."
            : "This is the last administrator — blocking it would lock everyone out of the admin panel.");
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
    /// <summary>Дата последнего заказа — в таблице по ней видно, кто ещё активен.</summary>
    public DateTime? LastOrderAt { get; set; }
}

/// <summary>Окно списка покупателей и точка, с которой продолжать.</summary>
public sealed class CustomerBrowsePageDto
{
    public IReadOnlyList<CustomerSearchHitDto> Items { get; set; } = Array.Empty<CustomerSearchHitDto>();
    /// <summary>Почта последней строки окна. null — список кончился.</summary>
    public string? NextCursor { get; set; }
    /// <summary>
    /// Сколько строк в срезе всего. Считается ТОЛЬКО для первого окна: таблице это нужно
    /// один раз — задать длину полосы прокрутки, — а повторять пересчёт на каждое окно
    /// значит платить за него всю прокрутку. У последующих окон здесь null.
    /// </summary>
    public long? Total { get; set; }
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
