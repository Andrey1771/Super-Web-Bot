using System.Diagnostics;
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
        IMemoryCache cache,
        ILogger<AdminDashboardService> logger)
    {
        _database = database;
        _keys = keys;
        _orders = orders;
        _games = games;
        _fx = fx;
        _http = http;
        _configuration = configuration;
        _currencies = currencies.Value;
        _chat = chat.Value;
        _cache = cache;
        _logger = logger;
    }

    public async Task<AdminDashboardDto> BuildAsync(CancellationToken ct)
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
        // Здоровье кэшируем на полминуты: пробы Keycloak и бота — сетевые вызовы с таймаутом, а
        // дашборд опрашивается каждую минуту; без кэша каждый Retry ждал бы таймаута заново.
        var healthTask = Safe(() => _cache.GetOrCreateAsync(HealthCacheKey, entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(30);
            return BuildHealthAsync(now, ct);
        })!, "health");

        await Task.WhenAll(ordersTask, keysTask, supportTask, paymentsTask, contentTask, healthTask);

        return new AdminDashboardDto
        {
            GeneratedAtUtc = now,
            BaseCurrency = _currencies.Base,
            Orders = ordersTask.Result,
            Keys = keysTask.Result,
            Support = supportTask.Result,
            Payments = paymentsTask.Result,
            Content = contentTask.Result,
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
        return new DashboardPaymentsDto { OpenFailures = (int)open };
    }

    // ---------- контент клиентов ----------

    private async Task<DashboardContentDto> BuildContentAsync(CancellationToken ct)
    {
        var reviews = _database.GetCollection<BsonDocument>("GameReviews");
        var questions = _database.GetCollection<BsonDocument>("GameQuestions");
        var pending = await reviews.CountDocumentsAsync(new BsonDocument("status", "Pending"), cancellationToken: ct);
        var unanswered = await questions.CountDocumentsAsync(
            new BsonDocument("$or", new BsonArray
            {
                new BsonDocument("answers", new BsonDocument("$size", 0)),
                new BsonDocument("answers", new BsonDocument("$exists", false))
            }), cancellationToken: ct);
        return new DashboardContentDto { PendingReviews = (int)pending, UnansweredQuestions = (int)unanswered };
    }

    // ---------- здоровье ----------

    private async Task<DashboardHealthDto> BuildHealthAsync(DateTime now, CancellationToken ct)
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
        var botProbe = ProbeAsync("Telegram bot service", _configuration["Dashboard:BotServiceUrl"] ?? "http://bot:7003/api/admin/bot/status", ct, acceptUnauthorized: true);
        await Task.WhenAll(keycloakProbe, botProbe);
        items.Add(keycloakProbe.Result);
        items.Add(botProbe.Result);

        // Платёжные рельсы: сконфигурированы ли ключи. Не «работает ли Stripe» — это узнаётся только реальным вызовом.
        var stripe = !string.IsNullOrWhiteSpace(_configuration["Stripe:SecretKey"]);
        items.Add(new DashboardHealthItemDto { Name = "Stripe", State = stripe ? "ok" : "unconfigured", Detail = stripe ? "secret key set" : "Stripe:SecretKey is empty" });

        var yooShop = !string.IsNullOrWhiteSpace(_configuration["YooKassa:ShopId"]);
        items.Add(new DashboardHealthItemDto { Name = "YooKassa", State = yooShop ? "ok" : "unconfigured", Detail = yooShop ? "shop id set" : "not configured" });

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

        // LLM поддержки: провайдер и ключ. Реальную доступность знает Chat stats.
        var llmConfigured = _chat.Provider.Equals("ollama", StringComparison.OrdinalIgnoreCase) || !string.IsNullOrWhiteSpace(_chat.DeepSeekApiKey);
        items.Add(new DashboardHealthItemDto { Name = $"Support LLM ({_chat.Provider})", State = llmConfigured ? "ok" : "unconfigured", Detail = llmConfigured ? "configured" : "API key missing" });

        return new DashboardHealthDto { Items = items };
    }

    private string BuildKeycloakWellKnownUrl()
    {
        var baseUri = _configuration["Keycloak:InternalUri"] ?? _configuration["Keycloak:Uri"] ?? "http://localhost:8088";
        var realm = _configuration["Keycloak:Realm"] ?? "TaleShop";
        return $"{baseUri.TrimEnd('/')}/realms/{realm}/.well-known/openid-configuration";
    }

    private async Task<DashboardHealthItemDto> ProbeAsync(string name, string url, CancellationToken ct, bool acceptUnauthorized = false)
    {
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
}

public sealed class DashboardContentDto
{
    /// <summary>Отзывы с жалобами, ждущие решения модератора.</summary>
    public int PendingReviews { get; set; }
    /// <summary>Вопросы на карточках игр без единого ответа.</summary>
    public int UnansweredQuestions { get; set; }
}

public sealed class DashboardHealthDto
{
    public List<DashboardHealthItemDto> Items { get; set; } = new();
}

public sealed class DashboardHealthItemDto
{
    public string Name { get; set; } = string.Empty;
    /// <summary>ok | warn | down | unconfigured</summary>
    public string State { get; set; } = "ok";
    public string? Detail { get; set; }
}
