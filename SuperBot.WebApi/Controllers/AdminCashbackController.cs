using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using SuperBot.Core.Cashback;
using SuperBot.Infrastructure.Data;
using SuperBot.WebApi.Services.Cashback;
using SuperBot.WebApi.Services.SiteSettings;
using SuperBot.WebApi.Support.Infrastructure;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Кэшбэк в панели: настройки программы (своя вкладка), сколько магазин должен покупателям, баланс, журнал и письма
/// конкретного покупателя, ручная правка. Только для администратора — это деньги. Все суммы в долларах: в них хранится баланс.
/// </summary>
[ApiController]
[Route("api/admin/cashback")]
[Authorize(Roles = "admin")]
public class AdminCashbackController : ControllerBase
{
    /// <summary>Сколько последних записей журнала показывать в карточке покупателя.</summary>
    private const int MaxEntries = 200;

    private readonly ICashbackLedger _ledger;
    private readonly IMongoDatabase _database;
    private readonly IMongoCollection<CashbackAccountDb> _accounts;
    private readonly IOptionsMonitor<CashbackOptions> _options;
    private readonly SiteSettingsStore _store;
    private readonly IConfiguration _configuration;

    public AdminCashbackController(
        ICashbackLedger ledger,
        IMongoDatabase database,
        IOptionsMonitor<CashbackOptions> options,
        SiteSettingsStore store,
        IConfiguration configuration)
    {
        _ledger = ledger;
        _database = database;
        _accounts = database.GetCollection<CashbackAccountDb>("CashbackAccounts");
        _options = options;
        _store = store;
        _configuration = configuration;
    }

    // ---------- настройки программы ----------

    /// <summary>
    /// Настройки программы: для каждого поля — действующее значение, значение из конфига и «переопределено ли», как в Site settings.
    /// Хранятся в том же документе настроек сайта, но сохраняются только отсюда.
    /// </summary>
    [HttpGet("settings")]
    public IActionResult GetSettings()
    {
        var doc = _store.Current;
        var options = _options.CurrentValue;
        var config = _configuration.GetSection("Cashback");
        var configTiers = config.GetSection("Tiers").Get<List<CashbackTierOptions>>();

        return Ok(new
        {
            updatedAtUtc = doc.UpdatedAtUtc,
            updatedBy = doc.UpdatedBy,
            enabled = Field(options.Enabled, config.GetValue<bool?>("Enabled") ?? true, doc.CashbackEnabled),
            pendingDays = Field(options.PendingDays, config.GetValue<int?>("PendingDays") ?? 14, doc.CashbackPendingDays),
            expiryMonths = Field(options.ExpiryMonths, config.GetValue<int?>("ExpiryMonths") ?? 12, doc.CashbackExpiryMonths),
            minCardPaymentUsd = Field(options.MinCardPaymentUsd, config.GetValue<decimal?>("MinCardPaymentUsd") ?? 1.00m, doc.CashbackMinCardPaymentUsd),
            emailNotices = Field(options.EmailNotices, config.GetValue<bool?>("EmailNotices") ?? true, doc.CashbackEmailNotices),
            expiryReminderDays = Field(options.ExpiryReminderDays, config.GetValue<int?>("ExpiryReminderDays") ?? 30, doc.CashbackExpiryReminderDays),
            tiers = new
            {
                value = options.EffectiveTiers,
                defaultValue = configTiers is { Count: > 0 } ? configTiers : CashbackOptions.DefaultTiers.ToList(),
                overridden = !string.IsNullOrWhiteSpace(doc.CashbackTiersJson),
            },
        });
    }

    /// <summary>Полное состояние настроек кэшбэка: null в поле — «как в конфиге». Остальные настройки сайта не трогаются.</summary>
    [HttpPut("settings")]
    public async Task<IActionResult> PutSettings([FromBody] CashbackSettingsPatch patch)
    {
        if (patch is null)
        {
            return BadRequest(new { message = "Empty body." });
        }

        var tiersError = ValidateTiers(patch.Tiers);
        if (tiersError != null)
        {
            return BadRequest(new { message = tiersError });
        }
        if (patch.PendingDays is < 0 or > 365 || patch.ExpiryMonths is < 0 or > 120 || patch.MinCardPaymentUsd is < 0 or > 100)
        {
            return BadRequest(new { message = "Pending days must be 0–365, expiry 0–120 months (0 = never), minimum card payment 0–100 USD." });
        }
        if (patch.ExpiryReminderDays is < 0 or > 180)
        {
            return BadRequest(new { message = "Expiry reminder must be 0–180 days (0 = no reminder)." });
        }

        var actor = SupportUserContext.FromClaims(User).Email;
        var saved = await _store.SaveAsync(doc =>
        {
            doc.CashbackEnabled = patch.Enabled;
            doc.CashbackPendingDays = patch.PendingDays;
            doc.CashbackExpiryMonths = patch.ExpiryMonths;
            doc.CashbackMinCardPaymentUsd = patch.MinCardPaymentUsd;
            doc.CashbackEmailNotices = patch.EmailNotices;
            doc.CashbackExpiryReminderDays = patch.ExpiryReminderDays;
            doc.CashbackTiersJson = patch.Tiers is { Count: > 0 }
                ? CashbackTiersJson.Serialize(patch.Tiers.Select(tier => new CashbackTierOptions
                {
                    Id = tier.Id.Trim().ToLowerInvariant(),
                    Name = tier.Name.Trim(),
                    Percent = tier.Percent,
                    SpendThresholdUsd = tier.SpendThresholdUsd,
                    ImageUrl = string.IsNullOrWhiteSpace(tier.ImageUrl) ? null : tier.ImageUrl.Trim()
                }).OrderBy(tier => tier.SpendThresholdUsd))
                : null;
        }, actor);

        return Ok(new { ok = true, message = "Cashback settings saved and applied.", updatedAtUtc = saved.UpdatedAtUtc, updatedBy = saved.UpdatedBy });
    }

    /// <summary>
    /// Уровни должны образовывать лестницу: первый открыт с нуля, пороги растут, процент не падает
    /// (иначе переход на уровень «выше» уменьшал бы кэшбэк), id уникальны — по ним кабинет узнаёт уровень.
    /// </summary>
    private static string? ValidateTiers(List<CashbackTierOptions>? tiers)
    {
        if (tiers is not { Count: > 0 })
        {
            return null;
        }
        if (tiers.Count > 10)
        {
            return "At most 10 levels.";
        }
        if (tiers.Any(tier => string.IsNullOrWhiteSpace(tier.Id) || string.IsNullOrWhiteSpace(tier.Name)))
        {
            return "Every level needs an id and a name.";
        }
        if (tiers.Select(tier => tier.Id.Trim().ToLowerInvariant()).Distinct().Count() != tiers.Count)
        {
            return "Level ids must be unique.";
        }
        // Картинка — из своей медиатеки: относительный путь или http(s). Ни javascript:, ни data: на витрину не пускаем.
        if (tiers.Any(tier => !string.IsNullOrWhiteSpace(tier.ImageUrl) && !IsSafeImageUrl(tier.ImageUrl.Trim())))
        {
            return "Level image must be a media library link (a /path or an http(s) address).";
        }
        if (tiers.Any(tier => tier.Percent is < 0 or > 50))
        {
            return "Percent must be within 0–50.";
        }
        var ordered = tiers.OrderBy(tier => tier.SpendThresholdUsd).ToList();
        if (ordered[0].SpendThresholdUsd != 0)
        {
            return "The first level must start at 0 spent.";
        }
        for (var i = 1; i < ordered.Count; i++)
        {
            if (ordered[i].SpendThresholdUsd == ordered[i - 1].SpendThresholdUsd)
            {
                return "Two levels cannot share a threshold.";
            }
            if (ordered[i].Percent < ordered[i - 1].Percent)
            {
                return "A higher level cannot give a lower percent.";
            }
        }
        return null;
    }

    private static bool IsSafeImageUrl(string url) =>
        url.Length <= 500
        && ((url.StartsWith('/') && !url.StartsWith("//"))
            || (Uri.TryCreate(url, UriKind.Absolute, out var absolute) && absolute.Scheme is "http" or "https"));

    private static object Field<T>(T effective, T? fromConfig, T? overrideValue) =>
        new { value = effective, defaultValue = fromConfig, overridden = overrideValue is not null };

    // ---------- сводка ----------

    /// <summary>
    /// Долг перед покупателями: доступное + ожидающее по всем счетам. Считается по снимкам балансов,
    /// которые обновляются при каждой записи в журнал, — достаточно точно для контроля маржи, но
    /// ожидающее, которое уже разблокировалось без новых записей, здесь ещё числится ожидающим.
    /// </summary>
    [HttpGet("overview")]
    public async Task<ActionResult<CashbackOverviewDto>> GetOverview(CancellationToken ct) =>
        Ok(await BuildOverviewAsync(_accounts, _options.CurrentValue, ct));

    public static async Task<CashbackOverviewDto> BuildOverviewAsync(IMongoCollection<CashbackAccountDb> accounts, CashbackOptions options, CancellationToken ct)
    {
        var all = await accounts.Find(FilterDefinition<CashbackAccountDb>.Empty).ToListAsync(ct);
        return new CashbackOverviewDto
        {
            Enabled = options.Enabled,
            AvailableUsd = CashbackProjection.Round(all.Sum(item => item.AvailableUsd)),
            PendingUsd = CashbackProjection.Round(all.Sum(item => item.PendingUsd)),
            ReservedUsd = CashbackProjection.Round(all.Sum(item => item.ReservedUsd)),
            EarnedAllTimeUsd = CashbackProjection.Round(all.Sum(item => item.EarnedAllTimeUsd)),
            UsedAllTimeUsd = CashbackProjection.Round(all.Sum(item => item.UsedAllTimeUsd)),
            CustomersWithBalance = all.Count(item => item.AvailableUsd + item.PendingUsd > 0)
        };
    }

    // ---------- покупатель ----------

    /// <summary>Баланс, журнал и письма о кэшбэке покупателя (ключ — email, как у заказов).</summary>
    [HttpGet("customers/{email}")]
    public async Task<ActionResult<AdminCustomerCashbackDto>> GetCustomer([FromRoute] string email)
    {
        var userKey = email.Trim();
        var entries = await _ledger.GetEntriesAsync(userKey);
        var summary = CashbackProjection.Project(entries, DateTime.UtcNow);
        var tier = _options.CurrentValue.TierFor(summary.QualifyingSpendUsd);

        return Ok(new AdminCustomerCashbackDto
        {
            Email = userKey,
            AvailableUsd = summary.AvailableUsd,
            PendingUsd = summary.PendingUsd,
            ReservedUsd = summary.ReservedUsd,
            EarnedAllTimeUsd = summary.EarnedAllTimeUsd,
            UsedAllTimeUsd = summary.UsedAllTimeUsd,
            ExpiredAllTimeUsd = summary.ExpiredAllTimeUsd,
            ForgivenAllTimeUsd = summary.ForgivenAllTimeUsd,
            QualifyingSpendUsd = summary.QualifyingSpendUsd,
            NextUnlockAt = summary.NextUnlockAt,
            TierName = tier.Name,
            TierPercent = tier.Percent,
            Entries = entries.Take(MaxEntries).Select(entry => new AdminCashbackEntryDto
            {
                Id = entry.Id ?? entry.IdempotencyKey,
                Type = entry.Type,
                Status = entry.Type == CashbackEntryTypes.Earn && entry.Id != null && summary.Earns.TryGetValue(entry.Id, out var earn)
                    ? earn.State
                    : entry.Status,
                AmountUsd = entry.AmountUsd,
                OrderId = entry.OrderId,
                OrderNumber = entry.OrderNumber,
                GameTitle = entry.GameTitle,
                Percent = entry.Percent,
                CreatedAt = entry.CreatedAt,
                UnlocksAt = entry.UnlocksAt,
                ExpiresAt = entry.ExpiresAt,
                Note = entry.Note,
                Actor = entry.Actor
            }).ToList(),
            Emails = await BuildEmailsAsync(userKey, entries)
        });
    }

    /// <summary>
    /// Какие письма о кэшбэке ушли покупателю и не отписался ли он. Нужно, когда покупатель говорит «мне не сказали, что сгорит».
    /// </summary>
    private async Task<AdminCashbackEmailsDto> BuildEmailsAsync(string userKey, IReadOnlyList<CashbackEntry> entries)
    {
        var email = CashbackNoticeTokens.Normalize(userKey);
        var optOut = await _database.GetCollection<CashbackNoticeOptOutDb>(CashbackNoticeService.OptOutsCollection)
            .Find(row => row.Email == email)
            .FirstOrDefaultAsync();
        var notices = await _database.GetCollection<CashbackNoticeDb>(CashbackNoticeService.NoticesCollection)
            .Find(row => row.Email == email)
            .SortByDescending(row => row.SentAtUtc)
            .Limit(100)
            .ToListAsync();

        var byId = entries.Where(entry => entry.Id != null).ToDictionary(entry => entry.Id!, StringComparer.Ordinal);
        return new AdminCashbackEmailsDto
        {
            Enabled = _options.CurrentValue.EmailNotices,
            OptedOut = optOut != null,
            OptedOutAt = optOut?.CreatedAtUtc,
            Sent = notices.Select(notice =>
            {
                // Ключ отметки — «вид:id записи журнала», по нему и восстанавливаем, о каком заказе и сумме было письмо.
                var separator = notice.Key.IndexOf(':');
                var kind = separator > 0 ? notice.Key[..separator] : notice.Key;
                var entryId = separator > 0 ? notice.Key[(separator + 1)..] : null;
                CashbackEntry? entry = null;
                if (entryId != null)
                {
                    byId.TryGetValue(entryId, out entry);
                }
                return new AdminCashbackEmailDto
                {
                    Kind = kind,
                    SentAt = notice.SentAtUtc,
                    OrderNumber = entry?.OrderNumber,
                    AmountUsd = entry?.AmountUsd,
                    ExpiresAt = kind == "expiring" ? entry?.ExpiresAt : null
                };
            }).ToList()
        };
    }

    /// <summary>
    /// Снова присылать письма о кэшбэке покупателю, который от них отписался. Только по его просьбе — поэтому с причиной,
    /// она остаётся в журнале приложения вместе с автором.
    /// </summary>
    [HttpPost("customers/{email}/emails/resume")]
    public async Task<IActionResult> ResumeEmails([FromRoute] string email, [FromBody] CashbackResumeEmailsRequest request, [FromServices] ILogger<AdminCashbackController> logger)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Reason))
        {
            return BadRequest(new { ok = false, message = "Say why — for example, the customer asked to get these emails again." });
        }

        var normalized = CashbackNoticeTokens.Normalize(email);
        var result = await _database.GetCollection<CashbackNoticeOptOutDb>(CashbackNoticeService.OptOutsCollection)
            .DeleteOneAsync(row => row.Email == normalized);
        if (result.DeletedCount == 0)
        {
            return Ok(new { ok = true, message = "This customer was not unsubscribed — nothing to change." });
        }

        logger.LogInformation("Cashback emails resumed for {Email} by {Actor}: {Reason}", normalized, SupportUserContext.FromClaims(User).Email, request.Reason.Trim());
        return Ok(new { ok = true, message = "Cashback emails are on again for this customer." });
    }

    /// <summary>
    /// Ручная правка баланса: плюс — пополнение (например, выигранный спор), минус — списание, но не ниже
    /// нуля. Причина обязательна и остаётся в журнале вместе с автором.
    /// </summary>
    [HttpPost("customers/{email}/adjust")]
    public async Task<IActionResult> Adjust([FromRoute] string email, [FromBody] CashbackAdjustRequest request)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Reason))
        {
            return BadRequest(new { ok = false, message = "A reason is required — it stays in the customer's cashback history." });
        }
        if (request.AmountUsd == 0 || Math.Abs(request.AmountUsd) > 10_000m)
        {
            return BadRequest(new { ok = false, message = "Amount must be non-zero and within ±10,000 USD." });
        }
        if (string.IsNullOrWhiteSpace(email) || !email.Contains('@'))
        {
            return BadRequest(new { ok = false, message = "Unknown customer." });
        }

        var actor = SupportUserContext.FromClaims(User).Email;
        await _ledger.AdjustAsync(email.Trim(), request.AmountUsd, request.Reason.Trim(), actor);
        var summary = await _ledger.GetSummaryAsync(email.Trim());
        return Ok(new
        {
            ok = true,
            message = request.AmountUsd > 0
                ? $"Added {request.AmountUsd:0.00} USD. Available now: {summary.AvailableUsd:0.00} USD."
                : $"Deducted up to {-request.AmountUsd:0.00} USD. Available now: {summary.AvailableUsd:0.00} USD."
        });
    }
}

/// <summary>Полное состояние настроек кэшбэка. null в поле — «как в конфиге».</summary>
public class CashbackSettingsPatch
{
    public bool? Enabled { get; set; }
    public int? PendingDays { get; set; }
    public int? ExpiryMonths { get; set; }
    public decimal? MinCardPaymentUsd { get; set; }
    public bool? EmailNotices { get; set; }
    public int? ExpiryReminderDays { get; set; }
    /// <summary>Уровни целиком; пусто/null — вернуться к конфигу/дефолту.</summary>
    public List<CashbackTierOptions>? Tiers { get; set; }
}

public class CashbackOverviewDto
{
    public bool Enabled { get; set; }
    public decimal AvailableUsd { get; set; }
    public decimal PendingUsd { get; set; }
    public decimal ReservedUsd { get; set; }
    public decimal EarnedAllTimeUsd { get; set; }
    public decimal UsedAllTimeUsd { get; set; }
    public int CustomersWithBalance { get; set; }
    /// <summary>Сколько магазин должен покупателям: доступное + ожидающее.</summary>
    public decimal LiabilityUsd => CashbackProjection.Round(AvailableUsd + PendingUsd);
}

public class AdminCustomerCashbackDto
{
    public string Email { get; set; } = string.Empty;
    public decimal AvailableUsd { get; set; }
    public decimal PendingUsd { get; set; }
    public decimal ReservedUsd { get; set; }
    public decimal EarnedAllTimeUsd { get; set; }
    public decimal UsedAllTimeUsd { get; set; }
    public decimal ExpiredAllTimeUsd { get; set; }
    public decimal ForgivenAllTimeUsd { get; set; }
    public decimal QualifyingSpendUsd { get; set; }
    public DateTime? NextUnlockAt { get; set; }
    public string TierName { get; set; } = string.Empty;
    public decimal TierPercent { get; set; }
    public List<AdminCashbackEntryDto> Entries { get; set; } = new();
    public AdminCashbackEmailsDto Emails { get; set; } = new();
}

public class AdminCashbackEntryDto
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string? Status { get; set; }
    public decimal AmountUsd { get; set; }
    public string? OrderId { get; set; }
    public string? OrderNumber { get; set; }
    public string? GameTitle { get; set; }
    public decimal? Percent { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UnlocksAt { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public string? Note { get; set; }
    public string? Actor { get; set; }
}

public class AdminCashbackEmailsDto
{
    /// <summary>Письма включены в настройках программы.</summary>
    public bool Enabled { get; set; }
    public bool OptedOut { get; set; }
    public DateTime? OptedOutAt { get; set; }
    public List<AdminCashbackEmailDto> Sent { get; set; } = new();
}

public class AdminCashbackEmailDto
{
    /// <summary>available — «кэшбэк стал доступен», expiring — «скоро сгорит».</summary>
    public string Kind { get; set; } = string.Empty;
    public DateTime SentAt { get; set; }
    public string? OrderNumber { get; set; }
    /// <summary>Сумма записи журнала, о которой письмо (для сгорания — исходная сумма пополнения, не остаток).</summary>
    public decimal? AmountUsd { get; set; }
    public DateTime? ExpiresAt { get; set; }
}

public class CashbackAdjustRequest
{
    /// <summary>Плюс — пополнить, минус — списать.</summary>
    public decimal AmountUsd { get; set; }
    public string Reason { get; set; } = string.Empty;
}

public class CashbackResumeEmailsRequest
{
    public string? Reason { get; set; }
}
