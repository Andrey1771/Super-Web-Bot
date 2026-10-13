using System.Diagnostics;
using System.Net.Sockets;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Payments;
using SuperBot.Infrastructure.Data;
using SuperBot.Infrastructure.Services;
using SuperBot.WebApi.Support.Chat;
using SuperBot.WebApi.Support.Chat.Models;
using SuperBot.WebApi.Support.Models;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Сводка для главной страницы админки — один запрос, всё считается в базе.
///
/// Раньше главная показывала «System status: Operational» и «Orders today: —» — текст,
/// зашитый в разметку. Здесь те же карточки заполняются тем, что уже умеют считать
/// остальные разделы (ключи, платежи, поддержка), поэтому нового учёта не появляется:
/// сводка — это витрина над существующими данными, а не ещё один источник правды.
/// </summary>
public sealed class AdminDashboardService
{
    // Что на дашборде считается «оплачено»: те же статусы, по которым Orders показывает выручку.
    private const string HealthCacheKey = "admin-dashboard-health";
    private static readonly string[] PaidStatuses = { "PAID", "PROCESSING", "AWAITING_KEYS", "DELIVERED" };

    private readonly IMongoDatabase _database;
    private readonly IGameKeyRepository _keys;
    private readonly IOrderRepository _orders;
    private readonly IGameRepository _games;
    private readonly IFxRateService _fx;
    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _configuration;
    private readonly StorefrontCurrencyOptions _currencies;
    private readonly SupportChatOptions _chat;
    private readonly SuperBot.WebApi.Mail.MailOptions _mail;
    private readonly ILogger<AdminDashboardService> _logger;
    private readonly IMemoryCache _cache;

    public AdminDashboardService(
        IMongoDatabase database,
        IGameKeyRepository keys,
        IOrderRepository orders,
        IGameRepository games,
        IFxRateService fx,
        IHttpClientFactory http,
        IConfiguration configuration,
        IOptions<StorefrontCurrencyOptions> currencies,
        IOptions<SupportChatOptions> chat,
        IOptions<SuperBot.WebApi.Mail.MailOptions> mail,
        IMemoryCache cache,
        ILogger<AdminDashboardService> logger,
        IOptionsMonitor<SuperBot.Core.Cashback.CashbackOptions> cashbackOptions)
    {
        _cashbackOptions = cashbackOptions;
        _database = database;
        _keys = keys;
        _orders = orders;
        _games = games;
        _fx = fx;
        _mail = mail.Value;
        _http = http;
        _configuration = configuration;
        _currencies = currencies.Value;
        _chat = chat.Value;
        _cache = cache;
        _logger = logger;
    }

    private readonly IOptionsMonitor<SuperBot.Core.Cashback.CashbackOptions> _cashbackOptions;

    public async Task<AdminDashboardDto> BuildAsync(CancellationToken ct, string? authorization = null)
    {
        var now = DateTime.UtcNow;
        var todayStart = now.Date;
        var weekStart = todayStart.AddDays(-6);

        // Блоки независимы — считаем параллельно; один упавший блок не должен ронять всю сводку,
        // поэтому каждый обёрнут в Safe(): в карточке будет прочерк, а в логе — причина.
        var ordersTask = Safe(() => BuildOrdersAsync(todayStart, weekStart, ct), "orders");
        var keysTask = Safe(() => BuildKeysAsync(ct), "keys");
        var supportTask = Safe(() => BuildSupportAsync(now, ct), "support");
        var paymentsTask = Safe(() => BuildPaymentsAsync(ct), "payments");
        var contentTask = Safe(() => BuildContentAsync(ct), "content");
        var cashbackTask = Safe(() => SuperBot.WebApi.Controllers.AdminCashbackController.BuildOverviewAsync(
            _database.GetCollection<SuperBot.Infrastructure.Data.CashbackAccountDb>("CashbackAccounts"), _cashbackOptions.CurrentValue, ct), "cashback");
        // Здоровье кэшируем на полминуты: пробы Keycloak и бота — сетевые вызовы с таймаутом, а
        // дашборд опрашивается каждую минуту; без кэша каждый Retry ждал бы таймаута заново.
        var healthTask = Safe(() => _cache.GetOrCreateAsync(HealthCacheKey, entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(30);
            return BuildHealthAsync(now, authorization, ct);
        })!, "health");

        await Task.WhenAll(ordersTask, keysTask, supportTask, paymentsTask, contentTask, healthTask, cashbackTask);

        return new AdminDashboardDto
        {
            GeneratedAtUtc = now,
            BaseCurrency = _currencies.Base,
            Orders = ordersTask.Result,
            Keys = keysTask.Result,
            Support = supportTask.Result,
            Payments = paymentsTask.Result,
            Content = contentTask.Result,
            Cashback = cashbackTask.Result,
            Health = healthTask.Result
        };
    }

    private async Task<T?> Safe<T>(Func<Task<T>> build, string block) where T : class
    {
        try
        {
            return await build();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Дашборд: блок {Block} не посчитался.", block);
            return null;
        }
    }

    // ---------- заказы ----------

    private async Task<DashboardOrdersDto> BuildOrdersAsync(DateTime todayStart, DateTime weekStart, CancellationToken ct)
    {
        var orders = _database.GetCollection<OrderDb>("Orders");

        // Сумма — по Totals.Total в валюте заказа; на дашборде показываем в базовой валюте, чтобы
        // «выручка за сегодня» была одним числом. Курс — из книги, которую использует чекаут.
        var book = _fx.Current();

        var since = Builders<OrderDb>.Filter.Gte(o => o.OrderDate, weekStart);
        var paid = Builders<OrderDb>.Filter.In(o => o.Status, PaidStatuses);

        var recent = await orders
            .Find(since & paid)
            .Project(o => new { o.OrderDate, o.Currency, Total = o.Totals.Total, o.TotalAmount })
            .ToListAsync(ct);

        decimal ToBase(string? currency, decimal amount)
        {
            if (string.IsNullOrWhiteSpace(currency) || currency.Equals(_currencies.Base, StringComparison.OrdinalIgnoreCase))
            {
                return amount;
            }
            // Книга хранит курсы «база → валюта»; для обратного перевода делим.
            var rate = book.For(currency);
            return rate is null || rate.Rate <= 0 ? 0m : Math.Round(amount / rate.Rate, 2);
        }

        var today = recent.Where(o => o.OrderDate >= todayStart).ToList();

        var byStatus = await orders.Aggregate()
            .Group(o => o.Status, g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync(ct);
        int Count(string status) => byStatus.FirstOrDefault(s => string.Equals(s.Status, status, StringComparison.OrdinalIgnoreCase))?.Count ?? 0;

        return new DashboardOrdersDto
        {
            TodayCount = today.Count,
            TodayRevenue = today.Sum(o => ToBase(o.Currency, o.Total != 0 ? o.Total : o.TotalAmount ?? 0)),
            WeekCount = recent.Count,
            WeekRevenue = recent.Sum(o => ToBase(o.Currency, o.Total != 0 ? o.Total : o.TotalAmount ?? 0)),
            AwaitingPayment = Count("PENDING") + Count("AWAITING_PAYMENT"),
            AwaitingKeys = Count("AWAITING_KEYS"),
            Failed = Count("FAILED")
        };
    }

    // ---------- ключи ----------

    private async Task<DashboardKeysDto> BuildKeysAsync(CancellationToken ct)
    {
        const int lowThreshold = 5; // тот же порог, что по умолчанию у Game keys → Overview

        var stats = (await _keys.GetInventorySummaryAsync()).ToDictionary(s => s.GameId, StringComparer.OrdinalIgnoreCase);
        var owed = await _orders.GetOwedKeyCountByGameAsync();
        var games = await _games.GetAllAsync();

        var attention = new List<DashboardKeyAttentionDto>();
        int outOfStock = 0, low = 0, awaiting = 0;

        foreach (var game in games.Where(g => !string.IsNullOrWhiteSpace(g.Id)))
        {
            stats.TryGetValue(game.Id!, out var s);
            var available = s?.Available ?? 0;
            var owe = owed.TryGetValue(game.Id!, out var n) ? n : 0;
            var title = string.IsNullOrWhiteSpace(game.Title) ? game.Name : game.Title;

            if (owe > 0)
            {
                awaiting += owe;
                attention.Add(new DashboardKeyAttentionDto { GameId = game.Id!, Title = title, Available = available, Awaiting = owe, Kind = "awaiting" });
            }
            else if (available == 0)
            {
                outOfStock++;
                attention.Add(new DashboardKeyAttentionDto { GameId = game.Id!, Title = title, Available = 0, Awaiting = 0, Kind = "out" });
            }
            else if (available <= lowThreshold)
            {
                low++;
                attention.Add(new DashboardKeyAttentionDto { GameId = game.Id!, Title = title, Available = available, Awaiting = 0, Kind = "low" });
            }
        }

        return new DashboardKeysDto
        {
            AwaitingKeys = awaiting,
            OutOfStockGames = outOfStock,
            LowStockGames = low,
            // Сначала те, где клиент уже заплатил, потом пустые, потом «мало». Не больше десяти —
            // это подсказка «куда идти», а полный список живёт в Game keys.
            Attention = attention
                .OrderByDescending(a => a.Awaiting)
                .ThenBy(a => a.Available)
                .Take(10)
                .ToList()
        };
    }

    // ---------- поддержка ----------

    private async Task<DashboardSupportDto> BuildSupportAsync(DateTime now, CancellationToken ct)
    {
        var sessions = _database.GetCollection<ChatSession>("SupportChatSessions");
        var tickets = _database.GetCollection<SupportTicket>("SupportTickets");

        var escalations = await sessions.CountDocumentsAsync(s => s.Status == ChatSessionStatus.NeedsAgent, cancellationToken: ct);
        var assigned = await sessions.CountDocumentsAsync(s => s.Status == ChatSessionStatus.Assigned, cancellationToken: ct);

        var openTickets = await tickets.CountDocumentsAsync(
            t => t.Status == SupportTicketStatus.Open || t.Status == SupportTicketStatus.WaitingForSupport,
            cancellationToken: ct);

        // Самое старое необработанное обращение — по нему видно, «горит» очередь или нет.
        var oldestEscalation = await sessions
            .Find(s => s.Status == ChatSessionStatus.NeedsAgent)
            .SortBy(s => s.UpdatedAt)
            .Limit(1)
            .FirstOrDefaultAsync(ct);

        return new DashboardSupportDto
        {
            ChatsNeedingAgent = (int)escalations,
            ChatsAssigned = (int)assigned,
            OpenTickets = (int)openTickets,
            OldestWaitingMinutes = oldestEscalation is null ? null : (int)Math.Max(0, (now - oldestEscalation.UpdatedAt).TotalMinutes)
        };
    }

    // ---------- платежи ----------

    private async Task<DashboardPaymentsDto> BuildPaymentsAsync(CancellationToken ct)
    {
        var failures = _database.GetCollection<BsonDocument>("PaymentFinalizationFailures");
        var open = await failures.CountDocumentsAsync(new BsonDocument("Status", "Open"), cancellationToken: ct);

        // Споры, по которым банк ждёт доказательств, — ближайший срок первым. Пропущенный срок означает проигрыш
        // автоматически, поэтому им место в «Needs attention», а не только в карточке заказа.
        var orders = _database.GetCollection<BsonDocument>("Orders");
        var awaiting = await orders
            .Find(new BsonDocument
            {
                { "Dispute.Outcome", new BsonDocument("$exists", false) },
                { "Dispute.HasEvidence", false },
                { "Dispute.Status", new BsonDocument("$in", new BsonArray { "needs_response", "warning_needs_response" }) }
            })
            .Sort(new BsonDocument("Dispute.EvidenceDueBy", 1))
            .Limit(10)
            .ToListAsync(ct);

        return new DashboardPaymentsDto
        {
            OpenFailures = (int)open,
            DisputesAwaitingEvidence = awaiting.Select(doc =>
            {
                var dispute = doc["Dispute"].AsBsonDocument;
                var currency = dispute.GetValue("Currency", "USD").AsString;
                return new DashboardDisputeDto
                {
                    OrderId = doc.GetValue("OrderId", BsonNull.Value).IsString ? doc["OrderId"].AsString : string.Empty,
                    OrderNumber = doc.GetValue("OrderNumber", BsonNull.Value).IsString ? doc["OrderNumber"].AsString : string.Empty,
                    EvidenceDueBy = dispute.GetValue("EvidenceDueBy", BsonNull.Value).IsValidDateTime ? dispute["EvidenceDueBy"].ToUniversalTime() : null,
                    Amount = SuperBot.Core.Payments.CurrencyMinorUnits.FromMinor(dispute.GetValue("AmountMinor", 0L).ToInt64(), currency),
                    Currency = currency
                };
            }).ToList()
        };
    }

    // ---------- контент клиентов ----------

    private async Task<DashboardContentDto> BuildContentAsync(CancellationToken ct)
    {
        var reviews = _database.GetCollection<BsonDocument>("GameReviews");
        var pending = await reviews.CountDocumentsAsync(new BsonDocument("status", "Pending"), cancellationToken: ct);
        return new DashboardContentDto { PendingReviews = (int)pending };
    }

    // ---------- здоровье ----------

    /// <summary>
    /// Свежий прогон проверок без кэша — для фонового монитора.
    ///
    /// Кэш на дашборде существует, чтобы Retry подряд не ждал таймаутов заново; монитору же
    /// нужен именно новый замер, иначе письмо об аварии придёт с получасовым опозданием.
    /// Токена пользователя здесь нет: до бот-сервиса монитор дотягивается внутренним токеном.
    /// </summary>
    public Task<DashboardHealthDto> CheckHealthAsync(CancellationToken ct) =>
        BuildHealthAsync(DateTime.UtcNow, authorization: null, ct);

    private async Task<DashboardHealthDto> BuildHealthAsync(DateTime now, string? authorization, CancellationToken ct)
    {
        var items = new List<DashboardHealthItemDto>();

        // Mongo: раз мы досюда дошли, соединение есть; меряем отклик, чтобы видеть деградацию.
        var sw = Stopwatch.StartNew();
        try
        {
            await _database.RunCommandAsync<BsonDocument>(new BsonDocument("ping", 1), cancellationToken: ct);
            items.Add(new DashboardHealthItemDto { Name = "MongoDB", State = "ok", Detail = $"{sw.ElapsedMilliseconds} ms" });
        }
        catch (Exception ex)
        {
            items.Add(new DashboardHealthItemDto { Name = "MongoDB", State = "down", Detail = ex.Message });
        }

        // Keycloak: публичный well-known, без авторизации. Бот: тот же сервис, что за
        // /api/admin/bot/status, спрашиваем без прав — достаточно, что отвечает (401 — тоже «жив»).
        // Пробы идут параллельно: последовательные суммировали бы таймауты.
        var keycloakProbe = ProbeAsync("Keycloak", BuildKeycloakWellKnownUrl(), ct);
        // Две отдельные строки, потому что это два разных вопроса. «Поднят ли контейнер»
        // отвечает обычная проба (её засчитывает даже 401). «Слышит ли бот людей» решает
        // вебхук — и он ломается сам по себе, при совершенно живом контейнере. Раньше была
        // только первая строка, и мёртвый вебхук неделю выглядел зелёным.
        var botProbe = ProbeAsync("Bot service", _configuration["Dashboard:BotServiceUrl"] ?? "http://bot:7003/api/admin/bot/status", ct, acceptUnauthorized: true);
        var webhookProbe = ProbeWebhookAsync(authorization, ct);
        var stripeProbe = ProbeStripeAsync(ct);
        var mailProbe = ProbeSmtpAsync(ct);
        var llmProbe = ProbeLlmAsync(ct);
        await Task.WhenAll(keycloakProbe, botProbe, webhookProbe, stripeProbe, mailProbe, llmProbe);
        items.Add(keycloakProbe.Result);
        items.Add(botProbe.Result);
        items.Add(webhookProbe.Result);
        items.Add(stripeProbe.Result);

        items.Add(mailProbe.Result);

        // Курсы: есть ли книга и не протухла ли. Сутки — с запасом к любому разумному расписанию импорта.
        var rates = _fx.Current().All();
        if (rates.Count == 0)
        {
            items.Add(new DashboardHealthItemDto { Name = "FX rates", State = _currencies.Supported().Count > 1 ? "warn" : "ok", Detail = "no rates loaded" });
        }
        else
        {
            var oldest = rates.Min(r => r.CapturedAtUtc);
            var age = now - oldest;
            items.Add(new DashboardHealthItemDto
            {
                Name = "FX rates",
                State = age > TimeSpan.FromHours(24) ? "warn" : "ok",
                Detail = $"{rates.Count} pairs, oldest {FormatAge(age)}"
            });
        }

        items.Add(llmProbe.Result);

        return new DashboardHealthDto { Items = items };
    }

    private string BuildKeycloakWellKnownUrl()
    {
        // Адрес, по которому Keycloak виден ИЗНУТРИ, а не из браузера. Первый же фоновый
        // прогон прислал письмо «Keycloak is down: Connection refused (localhost:8088)»:
        // проба брала публичный адрес, а внутри контейнера localhost — это он сам. Ложная
        // тревога в первый день — самый быстрый способ приучить не читать такие письма.
        // Порядок: готовый MetadataAddress, затем явный внутренний адрес, затем адрес
        // админ-клиента (он по определению серверный) и лишь в конце публичный.
        var metadata = _configuration["Keycloak:MetadataAddress"];
        if (!string.IsNullOrWhiteSpace(metadata))
        {
            return metadata;
        }

        var baseUri = _configuration["Keycloak:InternalUri"]
            ?? _configuration["Keycloak:Admin:BaseUrl"]
            ?? _configuration["Keycloak:Uri"]
            ?? "http://localhost/auth";
        var realm = _configuration["Keycloak:Realm"] ?? "TaleShop";
        return $"{baseUri.TrimEnd('/')}/realms/{realm}/.well-known/openid-configuration";
    }

    private async Task<DashboardHealthItemDto> ProbeAsync(string name, string url, CancellationToken ct, bool acceptUnauthorized = false)
    {
        if (!ExternalProbesEnabled)
        {
            return NotProbed(name, !string.IsNullOrWhiteSpace(url), "address set — probes disabled here", "address not configured");
        }

        var sw = Stopwatch.StartNew();
        try
        {
            using var client = _http.CreateClient("dashboard-probe");
            client.Timeout = TimeSpan.FromSeconds(2);
            using var response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
            var ok = response.IsSuccessStatusCode
                     || (acceptUnauthorized && (response.StatusCode == System.Net.HttpStatusCode.Unauthorized || response.StatusCode == System.Net.HttpStatusCode.Forbidden));
            return new DashboardHealthItemDto
            {
                Name = name,
                State = ok ? "ok" : "warn",
                Detail = $"{(int)response.StatusCode} in {sw.ElapsedMilliseconds} ms"
            };
        }
        catch (Exception ex)
        {
            return new DashboardHealthItemDto { Name = name, State = "down", Detail = ex is TaskCanceledException ? "timeout" : ex.Message };
        }
    }

    /// <summary>
    /// Вебхук Telegram: спрашиваем диагноз у бот-сервиса, а не считаем его сами.
    ///
    /// Разбор живёт там, где лежит токен бота, и повторять его здесь нельзя: две копии одной
    /// проверки разъезжаются, и дашборд начинает утверждать одно, а лог бота другое.
    /// «Не смогли спросить» и «вебхук сломан» — разные ответы: первый чинится связью между
    /// сервисами, второй регистрацией адреса.
    /// </summary>
    private async Task<DashboardHealthItemDto> ProbeWebhookAsync(string? authorization, CancellationToken ct)
    {
        const string name = "Telegram webhook";

        if (!ExternalProbesEnabled)
        {
            return NotProbed(name, true, "bot service configured — probes disabled here", string.Empty);
        }

        var url = _configuration["Dashboard:BotWebhookHealthUrl"] ?? "http://bot:7003/api/admin/bot/webhook-health";
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            // Дашборд ждать не должен: у бот-сервиса своя проба с таймаутом в 8 секунд,
            // и десяти нам хватает с запасом. Не успел — строка честно скажет об этом.
            timeout.CancelAfter(TimeSpan.FromSeconds(10));

            using var client = _http.CreateClient("dashboard-probe");
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            if (!string.IsNullOrWhiteSpace(authorization))
            {
                request.Headers.TryAddWithoutValidation("Authorization", authorization);
            }

            // Внутренний токен: им ходит фоновый монитор, у которого нет пользователя, и он же
            // страхует дашборд, если токен админа бот-сервису почему-то не подойдёт.
            var serviceToken = _configuration["Internal:ServiceToken"];
            if (!string.IsNullOrWhiteSpace(serviceToken))
            {
                request.Headers.TryAddWithoutValidation("X-Internal-Token", serviceToken);
            }

            using var response = await client.SendAsync(request, timeout.Token);
            if (!response.IsSuccessStatusCode)
            {
                return new DashboardHealthItemDto { Name = name, State = "warn", Detail = $"bot service answered {(int)response.StatusCode}" };
            }

            using var document = System.Text.Json.JsonDocument.Parse(await response.Content.ReadAsStringAsync(timeout.Token));
            var diagnosis = document.RootElement.TryGetProperty("diagnosis", out var d) ? d.GetString() ?? "Unknown" : "Unknown";
            var message = document.RootElement.TryGetProperty("message", out var m) ? m.GetString() : null;

            // «Былые ошибки» — тоже рабочее состояние: адрес зарегистрирован, отвечает,
            // очередь пуста. Всё остальное, кроме Ok, означает, что бот людей не слышит.
            var state = diagnosis switch
            {
                "Ok" or "PastErrors" => "ok",
                "Unknown" or "NotConfigured" => "warn",
                _ => "down"
            };

            return new DashboardHealthItemDto { Name = name, State = state, Detail = message };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Dashboard health: webhook probe failed");
            return new DashboardHealthItemDto
            {
                Name = name,
                State = "warn",
                Detail = ex is OperationCanceledException ? "bot service did not answer in time" : $"bot service unreachable: {ex.Message}"
            };
        }
    }

    /// <summary>
    /// Stripe: настоящий запрос вместо взгляда в конфигурацию.
    ///
    /// Баланс выбран как самый дешёвый read: он ничего не меняет и не зависит от того, есть
    /// ли в аккаунте платежи. «Ключ задан» и «Stripe отвечает» — разные вещи, и разошлись они
    /// у нас на практике: с верным ключом и заблокированной сетью кабинет отдавал 500, а
    /// дашборд показывал зелёный кружок.
    /// </summary>
    private async Task<DashboardHealthItemDto> ProbeStripeAsync(CancellationToken ct)
    {
        var key = _configuration["Stripe:SecretKey"];
        if (string.IsNullOrWhiteSpace(key) || key.StartsWith("__SET_VIA_ENV__", StringComparison.Ordinal))
        {
            return new DashboardHealthItemDto { Name = "Stripe", State = "unconfigured", Detail = "Stripe:SecretKey is empty" };
        }

        if (!ExternalProbesEnabled)
        {
            return NotProbed("Stripe", true, "secret key set — probes disabled here", string.Empty);
        }

        var sw = Stopwatch.StartNew();
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(4));

            var balances = new Stripe.BalanceService();
            await balances.GetAsync(
                new Stripe.RequestOptions { ApiKey = key },
                timeout.Token);

            return new DashboardHealthItemDto { Name = "Stripe", State = "ok", Detail = $"answered in {sw.ElapsedMilliseconds} ms" };
        }
        catch (Exception ex)
        {
            // Разделение то же, что в обработчике ошибок кабинета: «не достучались» чинится
            // сетью, «Stripe отказал» — ключом или настройками аккаунта. Действия разные.
            var detail = PaymentProviderOutage.IsUnreachable(ex)
                ? $"no answer: {PaymentProviderOutage.DescribeReason(ex)}"
                : $"Stripe rejected the request: {PaymentProviderOutage.DescribeReason(ex)}";

            _logger.LogWarning(ex, "Dashboard health: Stripe probe failed");
            return new DashboardHealthItemDto { Name = "Stripe", State = "down", Detail = detail };
        }
    }

    /// <summary>
    /// Почта: соединяемся с SMTP и читаем приветствие, ничего не отправляя.
    ///
    /// Проверять почту важнее, чем кажется: без неё не уходят ключи, а раньше её в списке
    /// не было вовсе. Строка приветствия «220 …» — доказательство, что за адресом именно
    /// почтовый сервер, а не просто открытый порт.
    /// </summary>
    private async Task<DashboardHealthItemDto> ProbeSmtpAsync(CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_mail.SmtpHost) || _mail.SmtpPort <= 0)
        {
            return new DashboardHealthItemDto { Name = "Mail (SMTP)", State = "unconfigured", Detail = "Mail:SmtpHost is empty" };
        }

        if (!ExternalProbesEnabled)
        {
            return NotProbed("Mail (SMTP)", true, "SMTP host set — probes disabled here", string.Empty);
        }

        var sw = Stopwatch.StartNew();
        var target = $"{_mail.SmtpHost}:{_mail.SmtpPort}";
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(3));

            using var tcp = new TcpClient();
            await tcp.ConnectAsync(_mail.SmtpHost, _mail.SmtpPort, timeout.Token);

            // На 465 порту разговор начинается сразу с TLS, открытого приветствия там нет:
            // ждать его — значит гарантированно получить таймаут на исправном сервере.
            if (_mail.SmtpPort == 465)
            {
                return new DashboardHealthItemDto { Name = "Mail (SMTP)", State = "ok", Detail = $"{target} accepts connections ({sw.ElapsedMilliseconds} ms)" };
            }

            using var reader = new StreamReader(tcp.GetStream());
            var greeting = await reader.ReadLineAsync(timeout.Token);

            return greeting != null && greeting.StartsWith("220", StringComparison.Ordinal)
                ? new DashboardHealthItemDto { Name = "Mail (SMTP)", State = "ok", Detail = $"{target} greeted in {sw.ElapsedMilliseconds} ms" }
                : new DashboardHealthItemDto { Name = "Mail (SMTP)", State = "warn", Detail = $"{target} answered \"{greeting}\" instead of 220" };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Dashboard health: SMTP probe failed");
            return new DashboardHealthItemDto
            {
                Name = "Mail (SMTP)",
                State = "down",
                Detail = ex is OperationCanceledException ? $"{target}: timeout" : $"{target}: {ex.Message}"
            };
        }
    }

    /// <summary>
    /// LLM поддержки: спрашиваем список моделей, а не ответ на вопрос.
    ///
    /// Обычная генерация проверила бы больше, но дашборд открывают часто, и каждая проверка
    /// стоила бы токенов. Список моделей у обоих провайдеров бесплатный и требует того же
    /// самого: чтобы сервис отвечал, а ключ подходил.
    /// </summary>
    private async Task<DashboardHealthItemDto> ProbeLlmAsync(CancellationToken ct)
    {
        var name = $"Support LLM ({_chat.Provider})";
        var isOllama = _chat.Provider.Equals("ollama", StringComparison.OrdinalIgnoreCase);

        string url;
        string? bearer = null;
        if (isOllama)
        {
            url = $"{_chat.OllamaBaseUrl.TrimEnd('/')}/api/tags";
        }
        else
        {
            if (string.IsNullOrWhiteSpace(_chat.DeepSeekApiKey))
            {
                return new DashboardHealthItemDto { Name = name, State = "unconfigured", Detail = "API key missing" };
            }
            url = $"{_chat.DeepSeekBaseUrl.TrimEnd('/')}/models";
            bearer = _chat.DeepSeekApiKey;
        }

        if (!ExternalProbesEnabled)
        {
            return NotProbed(name, true, "provider configured — probes disabled here", string.Empty);
        }

        var sw = Stopwatch.StartNew();
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            // DeepSeek со своим ключом отвечает на список моделей за 1–5 секунд: при четырёх проверка
            // через раз «падала», и каждые 5–10 минут уходило письмо «сломалось»/«починилось».
            // Десять — как у соседней пробы вебхука; пробы идут параллельно, дашборд дольше не ждёт.
            timeout.CancelAfter(TimeSpan.FromSeconds(10));

            using var client = _http.CreateClient("dashboard-probe");
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            if (bearer != null)
            {
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", bearer);
            }

            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);

            return response.IsSuccessStatusCode
                ? new DashboardHealthItemDto { Name = name, State = "ok", Detail = $"answered in {sw.ElapsedMilliseconds} ms" }
                : new DashboardHealthItemDto { Name = name, State = "down", Detail = $"answered {(int)response.StatusCode}" };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Dashboard health: LLM probe failed");
            return new DashboardHealthItemDto
            {
                Name = name,
                State = "down",
                Detail = ex is OperationCanceledException ? "timeout" : ex.Message
            };
        }
    }

    /// <summary>
    /// Ходить ли наружу за состоянием сервисов.
    ///
    /// Выключается там, где сети быть не должно, — прежде всего в тестах: набор не имеет
    /// права зависеть от чужих серверов, а таймауты складываются в минуты. Выключенная
    /// проба не может соврать в утешительную сторону: она отдаёт «configured», то есть
    /// «настроено, но не проверено», и никогда «ok».
    /// </summary>
    private bool ExternalProbesEnabled =>
        !string.Equals(_configuration["Dashboard:ExternalProbes"], "false", StringComparison.OrdinalIgnoreCase);

    private static DashboardHealthItemDto NotProbed(string name, bool configured, string configuredDetail, string missingDetail) =>
        new()
        {
            Name = name,
            State = configured ? "configured" : "unconfigured",
            Detail = configured ? configuredDetail : missingDetail
        };

    private static string FormatAge(TimeSpan age) =>
        age.TotalMinutes < 60 ? $"{(int)age.TotalMinutes} min ago"
        : age.TotalHours < 48 ? $"{(int)age.TotalHours} h ago"
        : $"{(int)age.TotalDays} d ago";
}

// ---------- DTO ----------

public sealed class AdminDashboardDto
{
    public DateTime GeneratedAtUtc { get; set; }
    public string BaseCurrency { get; set; } = "USD";
    public DashboardOrdersDto? Orders { get; set; }
    public DashboardKeysDto? Keys { get; set; }
    public DashboardSupportDto? Support { get; set; }
    public DashboardPaymentsDto? Payments { get; set; }
    public DashboardContentDto? Content { get; set; }
    /// <summary>Долг перед покупателями по кэшбэку (доллары).</summary>
    public SuperBot.WebApi.Controllers.CashbackOverviewDto? Cashback { get; set; }
    public DashboardHealthDto? Health { get; set; }
}

public sealed class DashboardOrdersDto
{
    public int TodayCount { get; set; }
    public decimal TodayRevenue { get; set; }
    public int WeekCount { get; set; }
    public decimal WeekRevenue { get; set; }
    public int AwaitingPayment { get; set; }
    public int AwaitingKeys { get; set; }
    public int Failed { get; set; }
}

public sealed class DashboardKeysDto
{
    public int AwaitingKeys { get; set; }
    public int OutOfStockGames { get; set; }
    public int LowStockGames { get; set; }
    public List<DashboardKeyAttentionDto> Attention { get; set; } = new();
}

public sealed class DashboardKeyAttentionDto
{
    public string GameId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public int Available { get; set; }
    public int Awaiting { get; set; }
    /// <summary>awaiting — клиент заплатил, ключа нет; out — пул пуст; low — мало.</summary>
    public string Kind { get; set; } = "low";
}

public sealed class DashboardSupportDto
{
    public int ChatsNeedingAgent { get; set; }
    public int ChatsAssigned { get; set; }
    public int OpenTickets { get; set; }
    public int? OldestWaitingMinutes { get; set; }
}

public sealed class DashboardPaymentsDto
{
    public int OpenFailures { get; set; }
    /// <summary>Споры, по которым банк ждёт доказательств, — ближайший срок первым (не больше десяти).</summary>
    public List<DashboardDisputeDto> DisputesAwaitingEvidence { get; set; } = new();
}

public sealed class DashboardDisputeDto
{
    public string OrderId { get; set; } = string.Empty;
    public string OrderNumber { get; set; } = string.Empty;
    public DateTime? EvidenceDueBy { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "USD";
}

public sealed class DashboardContentDto
{
    /// <summary>Отзывы с жалобами, ждущие решения модератора.</summary>
    public int PendingReviews { get; set; }
}

public sealed class DashboardHealthDto
{
    public List<DashboardHealthItemDto> Items { get; set; } = new();
}

public sealed class DashboardHealthItemDto
{
    public string Name { get; set; } = string.Empty;
    /// <summary>
    /// ok | configured | warn | down | unconfigured
    ///
    /// «ok» имеет право ставить только проверка, которая реально дёргала сервис.
    /// «configured» — ключи на месте, но доступность не проверялась: столько знает тот,
    /// кто заглянул в конфигурацию. Разница не косметическая. Stripe с верным ключом и
    /// заблокированной сетью держал здесь зелёный кружок, пока кабинет отдавал 500.
    /// </summary>
    public string State { get; set; } = "ok";
    public string? Detail { get; set; }
}
