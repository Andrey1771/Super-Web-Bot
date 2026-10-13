using Microsoft.Extensions.Options;
using Microsoft.Extensions.Primitives;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;
using SuperBot.Core.Cashback;
using SuperBot.Core.Payments;
using SuperBot.WebApi.Support.Chat;

namespace SuperBot.WebApi.Services.SiteSettings;

/// <summary>
/// Настройки магазина, которые владелец меняет руками, а не деплоем: часы поддержки и
/// ожидаемое время ответа, дневной бюджет LLM, наценка и гард курса, включённые платёжные
/// рельсы. Лежат одним документом в Mongo и накладываются ПОВЕРХ appsettings/env через
/// стандартный конвейер Options: <see cref="IPostConfigureOptions{TOptions}"/> подставляет
/// значения из документа, а <see cref="IOptionsChangeTokenSource{TOptions}"/> дёргает
/// <c>IOptionsMonitor</c> после сохранения — потребители видят новое значение без рестарта.
///
/// Незаполненное поле в документе (null) означает «как в конфиге»: оверлей ничего не трогает.
/// Так UI показывает и своё значение, и значение по умолчанию, и «откуда взято».
/// </summary>
public sealed class SiteSettingsStore
{
    public const string CollectionName = "SiteSettings";
    private const string DocumentId = "site";

    /// <summary>
    /// Через сколько секунд перечитывать настройки из базы.
    ///
    /// Раньше документ читался ОДИН раз и дальше жил в памяти, обновляясь только при сохранении
    /// на этом же экземпляре. При нескольких репликах это значило, что правка в админке долетала
    /// ровно до той реплики, которая обработала запрос: часы поддержки, наценка курса и
    /// включённые платёжные рельсы у соседних оставались прежними до перезапуска — и какой
    /// ответ получит покупатель, зависело от того, на какую реплику он попал.
    ///
    /// Тридцать секунд: настройки правят руками и редко, а держать их врозь дольше полуминуты
    /// незачем.
    /// </summary>
    private const int DefaultRefreshSeconds = 30;

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<SiteSettingsStore> _logger;
    private readonly object _gate = new();
    private SiteSettingsDocument _current = new();
    private CancellationTokenSource _changeSource = new();

    /// <summary>Когда документ последний раз читали из базы. MinValue — не читали ни разу.</summary>
    private DateTime _readAtUtc = DateTime.MinValue;

    /// <summary>Один читатель за раз: без этого при истечении срока в базу ломятся все запросы сразу.</summary>
    private readonly SemaphoreSlim _readGate = new(1, 1);

    private readonly TimeSpan _refreshInterval;

    public SiteSettingsStore(IServiceScopeFactory scopeFactory, IConfiguration configuration, ILogger<SiteSettingsStore> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;

        // Насколько документ может отстать от базы. Ноль — перечитывать каждый раз (для тестов).
        var seconds = configuration.GetValue<int?>("SiteSettings:RefreshSeconds") ?? DefaultRefreshSeconds;
        _refreshInterval = TimeSpan.FromSeconds(Math.Max(0, seconds));
    }

    /// <summary>
    /// Текущий документ. При первом обращении читается из базы, дальше перечитывается не чаще
    /// одного раза в <see cref="DefaultRefreshSeconds"/> секунд — так правка, сделанная на
    /// соседней реплике, доезжает сюда сама.
    /// </summary>
    public SiteSettingsDocument Current
    {
        get
        {
            EnsureFresh();
            lock (_gate)
            {
                return _current;
            }
        }
    }

    public IChangeToken ChangeToken
    {
        get
        {
            lock (_gate)
            {
                return new CancellationChangeToken(_changeSource.Token);
            }
        }
    }

    public async Task<SiteSettingsDocument> SaveAsync(Action<SiteSettingsDocument> patch, string actor)
    {
        EnsureFresh();
        SiteSettingsDocument next;
        lock (_gate)
        {
            next = _current.Clone();
        }
        patch(next);
        next.Id = DocumentId;
        // Округляем до миллисекунды намеренно: Mongo хранит дату именно так. Положив в
        // память тики .NET, мы получили бы обратно из базы то же самое значение, но
        // усечённое, сравнение в EnsureFresh решило бы «документ изменился», и после каждого
        // сохранения зря пересобирались бы все Options — а в журнал ушла бы запись
        // «изменено на другом инстансе», которой не было.
        next.UpdatedAtUtc = TruncateToMilliseconds(DateTime.UtcNow);
        next.UpdatedBy = actor;

        using var scope = _scopeFactory.CreateScope();
        var collection = scope.ServiceProvider.GetRequiredService<IMongoDatabase>().GetCollection<SiteSettingsDocument>(CollectionName);
        await collection.ReplaceOneAsync(d => d.Id == DocumentId, next, new ReplaceOptions { IsUpsert = true });

        CancellationTokenSource previous;
        lock (_gate)
        {
            _current = next;
            // Только что записали своё — перечитывать сразу незачем.
            _readAtUtc = DateTime.UtcNow;
            previous = _changeSource;
            _changeSource = new CancellationTokenSource();
        }
        // Уведомляем IOptionsMonitor всех типов, подписанных на этот токен.
        previous.Cancel();
        previous.Dispose();
        return next;
    }

    /// <summary>Точность хранения даты в Mongo — миллисекунда; приводим к ней заранее.</summary>
    private static DateTime TruncateToMilliseconds(DateTime value) =>
        new(value.Ticks - value.Ticks % TimeSpan.TicksPerMillisecond, value.Kind);

    private void EnsureFresh()
    {
        bool firstRead;
        lock (_gate)
        {
            firstRead = _readAtUtc == DateTime.MinValue;
            if (!firstRead && DateTime.UtcNow - _readAtUtc < _refreshInterval)
            {
                return;
            }
        }

        // Читает один; остальные в это время работают с прежним документом, а не ждут в очереди.
        // Исключение — самое первое чтение: отдавать пустые настройки нельзя, там ждём.
        if (!_readGate.Wait(0))
        {
            if (!firstRead)
            {
                return;
            }
            _readGate.Wait();
        }

        try
        {
            lock (_gate)
            {
                if (_readAtUtc != DateTime.MinValue && DateTime.UtcNow - _readAtUtc < _refreshInterval)
                {
                    return;
                }
                // Отметку ставим ДО чтения: иначе долгий или упавший запрос заставит ломиться
                // в базу на каждом обращении подряд.
                _readAtUtc = DateTime.UtcNow;
            }

            SiteSettingsDocument fresh;
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var collection = scope.ServiceProvider.GetRequiredService<IMongoDatabase>().GetCollection<SiteSettingsDocument>(CollectionName);
                fresh = collection.Find(d => d.Id == DocumentId).FirstOrDefault() ?? new SiteSettingsDocument { Id = DocumentId };
            }
            catch (Exception ex)
            {
                // База недоступна. На старте это «работаем по конфигу», при обновлении —
                // «оставляем то, что уже знаем»: обнулять действующие настройки из-за сетевого
                // сбоя нельзя, иначе моргнут часы поддержки и платёжные рельсы.
                _logger.LogWarning(ex, "Site settings: could not read overrides, keeping the previous copy.");
                if (firstRead)
                {
                    lock (_gate)
                    {
                        _current = new SiteSettingsDocument { Id = DocumentId };
                    }
                }
                return;
            }

            CancellationTokenSource? previous = null;
            lock (_gate)
            {
                // Токен дёргаем только когда документ действительно изменился: иначе каждые
                // тридцать секунд пересобирались бы все Options, подписанные на него.
                var changed = _current.UpdatedAtUtc != fresh.UpdatedAtUtc || _current.UpdatedBy != fresh.UpdatedBy;
                _current = fresh;
                if (changed && !firstRead)
                {
                    previous = _changeSource;
                    _changeSource = new CancellationTokenSource();
                }
            }

            if (previous is not null)
            {
                _logger.LogInformation("Site settings changed elsewhere — picked up (saved by {Actor}).", fresh.UpdatedBy);
                previous.Cancel();
                previous.Dispose();
            }
        }
        finally
        {
            _readGate.Release();
        }
    }
}

[BsonIgnoreExtraElements]
public sealed class SiteSettingsDocument
{
    [BsonId]
    public string Id { get; set; } = "site";
    public DateTime? UpdatedAtUtc { get; set; }
    public string? UpdatedBy { get; set; }

    // --- поддержка ---
    public bool? BusinessHoursEnabled { get; set; }
    public string? BusinessHoursTimeZone { get; set; }
    public int? BusinessHoursStart { get; set; }
    public int? BusinessHoursEnd { get; set; }
    public int? ExpectedWaitMinutes { get; set; }
    public string? SpecialistEmail { get; set; }
    public decimal? LlmDailyBudgetUsd { get; set; }
    public bool? NotifyTelegramOnEscalation { get; set; }
    public bool? NotifyEmailOnEscalation { get; set; }

    // --- курсы ---
    public decimal? FxMarkupPercent { get; set; }
    public decimal? FxMaxChangePercent { get; set; }

    // --- платёжные рельсы (выключатели поверх наличия ключей) ---
    public bool? CardEnabled { get; set; }
    public bool? CryptoEnabled { get; set; }
    public bool? StarsEnabled { get; set; }

    // --- склад ключей ---
    /// <summary>Общий порог «скоро закончится» (ключей в пуле ≤ порога). У игры может быть свой.</summary>
    public int? LowStockThreshold { get; set; }

    // --- страница «О нас» ---
    /// <summary>Люди в разделе «Meet the team» (JSON-массив {name,role,description,badge}).
    /// Пусто — раздела на странице нет. Выдумывать сотрудников нельзя, поэтому дефолта здесь
    /// нет и быть не может: список заполняет владелец.</summary>
    public string? TeamJson { get; set; }

    // --- подвал ---
    /// <summary>Ссылки на соцсети магазина (JSON-массив {network,url}, см. SocialLinks). Пусто — блока соцсетей нет.</summary>
    public string? SocialLinksJson { get; set; }

    // --- регионы активации ---
    /// <summary>Справочник регионов (JSON-массив {code,name,countries[]}); пусто — конфиг/дефолт.</summary>
    public string? RegionsJson { get; set; }

    // --- кэшбэк ---
    public bool? CashbackEnabled { get; set; }
    public int? CashbackPendingDays { get; set; }
    public int? CashbackExpiryMonths { get; set; }
    public decimal? CashbackMinCardPaymentUsd { get; set; }
    /// <summary>Уровни (JSON-массив {id,name,percent,spendThresholdUsd}); пусто — конфиг/дефолт.</summary>
    public string? CashbackTiersJson { get; set; }
    /// <summary>Письма «кэшбэк доступен» и «скоро сгорит».</summary>
    public bool? CashbackEmailNotices { get; set; }
    /// <summary>За сколько дней до сгорания напоминать; 0 — не напоминать.</summary>
    public int? CashbackExpiryReminderDays { get; set; }

    public SiteSettingsDocument Clone() => (SiteSettingsDocument)MemberwiseClone();
}

/// <summary>Оверлей поверх SupportChatOptions: только те поля, что редактируются в UI.</summary>
public sealed class SupportChatOptionsOverlay : IPostConfigureOptions<SupportChatOptions>, IOptionsChangeTokenSource<SupportChatOptions>
{
    private readonly SiteSettingsStore _store;
    public SupportChatOptionsOverlay(SiteSettingsStore store) => _store = store;
    public string? Name => Options.DefaultName;
    public IChangeToken GetChangeToken() => _store.ChangeToken;

    public void PostConfigure(string? name, SupportChatOptions options)
    {
        var s = _store.Current;
        if (s.BusinessHoursEnabled.HasValue) options.BusinessHoursEnabled = s.BusinessHoursEnabled.Value;
        if (!string.IsNullOrWhiteSpace(s.BusinessHoursTimeZone)) options.BusinessHoursTimeZone = s.BusinessHoursTimeZone;
        if (s.BusinessHoursStart.HasValue) options.BusinessHoursStart = s.BusinessHoursStart.Value;
        if (s.BusinessHoursEnd.HasValue) options.BusinessHoursEnd = s.BusinessHoursEnd.Value;
        if (s.ExpectedWaitMinutes.HasValue) options.ExpectedWaitMinutes = s.ExpectedWaitMinutes.Value;
        if (!string.IsNullOrWhiteSpace(s.SpecialistEmail)) options.SpecialistEmail = s.SpecialistEmail;
        if (s.LlmDailyBudgetUsd.HasValue) options.DailyBudgetUsd = s.LlmDailyBudgetUsd.Value;
        if (s.NotifyTelegramOnEscalation.HasValue) options.NotifyTelegramOnEscalation = s.NotifyTelegramOnEscalation.Value;
        if (s.NotifyEmailOnEscalation.HasValue) options.NotifyEmailOnEscalation = s.NotifyEmailOnEscalation.Value;
    }
}

/// <summary>
/// Оверлей поверх CashbackOptions: программу включают и настраивают из панели (вкладка Cashback), без деплоя.
/// Уровни заменяются списком целиком — частичная правка списка уровней смысла не имеет.
/// </summary>
public sealed class CashbackOptionsOverlay : IPostConfigureOptions<CashbackOptions>, IOptionsChangeTokenSource<CashbackOptions>
{
    private readonly SiteSettingsStore _store;
    public CashbackOptionsOverlay(SiteSettingsStore store) => _store = store;
    public string? Name => Options.DefaultName;
    public IChangeToken GetChangeToken() => _store.ChangeToken;

    public void PostConfigure(string? name, CashbackOptions options)
    {
        var s = _store.Current;
        if (s.CashbackEnabled.HasValue) options.Enabled = s.CashbackEnabled.Value;
        if (s.CashbackPendingDays.HasValue) options.PendingDays = s.CashbackPendingDays.Value;
        if (s.CashbackExpiryMonths.HasValue) options.ExpiryMonths = s.CashbackExpiryMonths.Value;
        if (s.CashbackMinCardPaymentUsd.HasValue) options.MinCardPaymentUsd = s.CashbackMinCardPaymentUsd.Value;
        if (s.CashbackEmailNotices.HasValue) options.EmailNotices = s.CashbackEmailNotices.Value;
        if (s.CashbackExpiryReminderDays.HasValue) options.ExpiryReminderDays = s.CashbackExpiryReminderDays.Value;
        var tiers = CashbackTiersJson.Parse(s.CashbackTiersJson);
        if (tiers.Count > 0) options.Tiers = tiers;
    }
}

/// <summary>Уровни кэшбэка в документе настроек — JSON-строкой, как и другие списки.</summary>
public static class CashbackTiersJson
{
    private static readonly System.Text.Json.JsonSerializerOptions Json = new(System.Text.Json.JsonSerializerDefaults.Web);

    public static List<CashbackTierOptions> Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try { return System.Text.Json.JsonSerializer.Deserialize<List<CashbackTierOptions>>(json, Json) ?? new(); }
        catch (System.Text.Json.JsonException) { return new(); }
    }

    public static string Serialize(IEnumerable<CashbackTierOptions> tiers) => System.Text.Json.JsonSerializer.Serialize(tiers, Json);
}

/// <summary>Оверлей поверх FxOptions: наценка и гард.</summary>
public sealed class FxOptionsOverlay : IPostConfigureOptions<FxOptions>, IOptionsChangeTokenSource<FxOptions>
{
    private readonly SiteSettingsStore _store;
    public FxOptionsOverlay(SiteSettingsStore store) => _store = store;
    public string? Name => Options.DefaultName;
    public IChangeToken GetChangeToken() => _store.ChangeToken;

    public void PostConfigure(string? name, FxOptions options)
    {
        var s = _store.Current;
        if (s.FxMarkupPercent.HasValue) options.MarkupPercent = s.FxMarkupPercent.Value;
        if (s.FxMaxChangePercent.HasValue) options.MaxChangePercent = s.FxMaxChangePercent.Value;
    }
}

/// <summary>Выключатели платёжных рельсов. Рельс включён, если и ключи есть, и тумблер не выключен.</summary>
public sealed class PaymentRailsOptions
{
    public bool CardEnabled { get; set; } = true;
    public bool CryptoEnabled { get; set; } = true;
    public bool StarsEnabled { get; set; } = true;
}

public sealed class PaymentRailsOverlay : IPostConfigureOptions<PaymentRailsOptions>, IOptionsChangeTokenSource<PaymentRailsOptions>
{
    private readonly SiteSettingsStore _store;
    public PaymentRailsOverlay(SiteSettingsStore store) => _store = store;
    public string? Name => Options.DefaultName;
    public IChangeToken GetChangeToken() => _store.ChangeToken;

    public void PostConfigure(string? name, PaymentRailsOptions options)
    {
        var s = _store.Current;
        if (s.CardEnabled.HasValue) options.CardEnabled = s.CardEnabled.Value;
        if (s.CryptoEnabled.HasValue) options.CryptoEnabled = s.CryptoEnabled.Value;
        if (s.StarsEnabled.HasValue) options.StarsEnabled = s.StarsEnabled.Value;
    }
}

/// <summary>
/// Склад ключей для витрины: порог «скоро закончится». Общий дефолт отсюда (или из конфига
/// Storefront:Stock), у игры его можно переопределить в разделе ключей.
/// </summary>
public sealed class StockOptions
{
    public int LowStockThreshold { get; set; } = 3;
}

public sealed class StockOptionsOverlay : IPostConfigureOptions<StockOptions>, IOptionsChangeTokenSource<StockOptions>
{
    private readonly SiteSettingsStore _store;
    public StockOptionsOverlay(SiteSettingsStore store) => _store = store;
    public string? Name => Options.DefaultName;
    public IChangeToken GetChangeToken() => _store.ChangeToken;

    public void PostConfigure(string? name, StockOptions options)
    {
        var s = _store.Current;
        if (s.LowStockThreshold is >= 0) options.LowStockThreshold = s.LowStockThreshold.Value;
    }
}
