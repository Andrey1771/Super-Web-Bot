using Microsoft.Extensions.Options;
using Microsoft.Extensions.Primitives;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;
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

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<SiteSettingsStore> _logger;
    private readonly object _gate = new();
    private SiteSettingsDocument _current = new();
    private bool _loaded;
    private CancellationTokenSource _changeSource = new();

    public SiteSettingsStore(IServiceScopeFactory scopeFactory, ILogger<SiteSettingsStore> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    /// <summary>Текущий документ; при первом обращении читается из базы (синхронно — это старт).</summary>
    public SiteSettingsDocument Current
    {
        get
        {
            EnsureLoaded();
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
        EnsureLoaded();
        SiteSettingsDocument next;
        lock (_gate)
        {
            next = _current.Clone();
        }
        patch(next);
        next.Id = DocumentId;
        next.UpdatedAtUtc = DateTime.UtcNow;
        next.UpdatedBy = actor;

        using var scope = _scopeFactory.CreateScope();
        var collection = scope.ServiceProvider.GetRequiredService<IMongoDatabase>().GetCollection<SiteSettingsDocument>(CollectionName);
        await collection.ReplaceOneAsync(d => d.Id == DocumentId, next, new ReplaceOptions { IsUpsert = true });

        CancellationTokenSource previous;
        lock (_gate)
        {
            _current = next;
            previous = _changeSource;
            _changeSource = new CancellationTokenSource();
        }
        // Уведомляем IOptionsMonitor всех типов, подписанных на этот токен.
        previous.Cancel();
        previous.Dispose();
        return next;
    }

    private void EnsureLoaded()
    {
        if (_loaded)
        {
            return;
        }
        lock (_gate)
        {
            if (_loaded)
            {
                return;
            }
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var collection = scope.ServiceProvider.GetRequiredService<IMongoDatabase>().GetCollection<SiteSettingsDocument>(CollectionName);
                _current = collection.Find(d => d.Id == DocumentId).FirstOrDefault() ?? new SiteSettingsDocument { Id = DocumentId };
            }
            catch (Exception ex)
            {
                // База недоступна на старте — работаем по конфигу; следующая попытка при первом сохранении.
                _logger.LogWarning(ex, "Site settings: could not load overrides, using configuration only.");
                _current = new SiteSettingsDocument { Id = DocumentId };
            }
            _loaded = true;
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
