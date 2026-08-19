using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using SuperBot.Core.Payments;
using SuperBot.WebApi.Services.SiteSettings;
using SuperBot.WebApi.Support.Chat;
using SuperBot.WebApi.Support.Infrastructure;
using SuperBot.Infrastructure.Models;
using SuperBot.WebApi.Services;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Настройки сайта, которые владелец меняет из панели. Отдаёт для каждого поля три вещи:
/// действующее значение, значение из конфига и «переопределено ли» — чтобы в UI было видно,
/// что задано руками, а что унаследовано, и можно было вернуть к конфигу одной кнопкой.
/// </summary>
[ApiController]
[Route("api/admin/site-settings")]
[Authorize(Roles = "admin")]
public class AdminSiteSettingsController : ControllerBase
{
    private readonly SiteSettingsStore _store;
    private readonly IConfiguration _configuration;
    private readonly IOptionsSnapshot<SupportChatOptions> _chat;
    private readonly IOptionsSnapshot<FxOptions> _fx;
    private readonly IOptionsSnapshot<PaymentRailsOptions> _rails;
    private readonly IOptions<StripeSettings> _stripe;
    private readonly BtcPayOptions _btcPay;

    public AdminSiteSettingsController(
        SiteSettingsStore store,
        IConfiguration configuration,
        IOptionsSnapshot<SupportChatOptions> chat,
        IOptionsSnapshot<FxOptions> fx,
        IOptionsSnapshot<PaymentRailsOptions> rails,
        IOptions<StripeSettings> stripe,
        IOptions<BtcPayOptions> btcPay)
    {
        _store = store;
        _configuration = configuration;
        _chat = chat;
        _fx = fx;
        _rails = rails;
        _stripe = stripe;
        _btcPay = btcPay.Value;
    }

    [HttpGet]
    public IActionResult Get()
    {
        var doc = _store.Current;
        var chat = _chat.Value;
        var fx = _fx.Value;
        var rails = _rails.Value;

        // Значения «из конфига» — из IConfiguration напрямую, минуя оверлей: иначе после
        // переопределения мы бы показали своё же значение как значение по умолчанию.
        var cfgChat = _configuration.GetSection("SupportChat");
        var cfgFx = _configuration.GetSection("Storefront:Fx");
        var cfgRails = _configuration.GetSection("PaymentRails");

        return Ok(new
        {
            updatedAtUtc = doc.UpdatedAtUtc,
            updatedBy = doc.UpdatedBy,
            support = new
            {
                businessHoursEnabled = Field(chat.BusinessHoursEnabled, cfgChat.GetValue<bool?>("BusinessHoursEnabled") ?? false, doc.BusinessHoursEnabled),
                businessHoursTimeZone = Field(chat.BusinessHoursTimeZone, cfgChat["BusinessHoursTimeZone"] ?? "UTC", doc.BusinessHoursTimeZone),
                businessHoursStart = Field(chat.BusinessHoursStart, cfgChat.GetValue<int?>("BusinessHoursStart") ?? 10, doc.BusinessHoursStart),
                businessHoursEnd = Field(chat.BusinessHoursEnd, cfgChat.GetValue<int?>("BusinessHoursEnd") ?? 19, doc.BusinessHoursEnd),
                expectedWaitMinutes = Field(chat.ExpectedWaitMinutes, cfgChat.GetValue<int?>("ExpectedWaitMinutes") ?? 15, doc.ExpectedWaitMinutes),
                specialistEmail = Field(chat.SpecialistEmail, cfgChat["SpecialistEmail"], doc.SpecialistEmail),
                notifyTelegramOnEscalation = Field(chat.NotifyTelegramOnEscalation, cfgChat.GetValue<bool?>("NotifyTelegramOnEscalation") ?? chat.NotifyTelegramOnEscalation, doc.NotifyTelegramOnEscalation),
                notifyEmailOnEscalation = Field(chat.NotifyEmailOnEscalation, cfgChat.GetValue<bool?>("NotifyEmailOnEscalation") ?? chat.NotifyEmailOnEscalation, doc.NotifyEmailOnEscalation),
                llmProvider = chat.Provider,
                llmDailyBudgetUsd = Field(chat.DailyBudgetUsd, cfgChat.GetValue<decimal?>("DailyBudgetUsd") ?? 0m, doc.LlmDailyBudgetUsd),
            },
            fx = new
            {
                markupPercent = Field(fx.MarkupPercent, cfgFx.GetValue<decimal?>("MarkupPercent") ?? 3m, doc.FxMarkupPercent),
                maxChangePercent = Field(fx.MaxChangePercent, cfgFx.GetValue<decimal?>("MaxChangePercent") ?? 10m, doc.FxMaxChangePercent),
            },
            rails = new
            {
                card = new
                {
                    enabled = Field(rails.CardEnabled, cfgRails.GetValue<bool?>("CardEnabled") ?? true, doc.CardEnabled),
                    configured = !string.IsNullOrWhiteSpace(_stripe.Value.PublishableKey),
                    hint = "Stripe cards. Needs Stripe:PublishableKey / SecretKey in configuration.",
                },
                crypto = new
                {
                    enabled = Field(rails.CryptoEnabled, cfgRails.GetValue<bool?>("CryptoEnabled") ?? true, doc.CryptoEnabled),
                    configured = _btcPay.IsAvailable,
                    hint = "BTCPay. Needs BtcPay:Enabled=true and server credentials in configuration.",
                },
                stars = new
                {
                    enabled = Field(rails.StarsEnabled, cfgRails.GetValue<bool?>("StarsEnabled") ?? true, doc.StarsEnabled),
                    configured = !string.IsNullOrWhiteSpace(_configuration["BotConfiguration:BotToken"]),
                    hint = "Telegram Stars are sold inside the bot; this switch is reserved for the bot service.",
                },
            }
        });
    }

    [HttpPut]
    public async Task<IActionResult> Put([FromBody] SiteSettingsPatch patch)
    {
        if (patch is null)
        {
            return BadRequest(new { message = "Empty body." });
        }
        if (patch.BusinessHoursStart is < 0 or > 23 || patch.BusinessHoursEnd is < 1 or > 24)
        {
            return BadRequest(new { message = "Business hours must be within 0–24." });
        }
        if (patch.BusinessHoursStart.HasValue && patch.BusinessHoursEnd.HasValue && patch.BusinessHoursStart >= patch.BusinessHoursEnd)
        {
            return BadRequest(new { message = "Business hours must start before they end." });
        }
        if (patch.ExpectedWaitMinutes is < 0 || patch.LlmDailyBudgetUsd is < 0 || patch.FxMarkupPercent is < 0 || patch.FxMaxChangePercent is <= 0)
        {
            return BadRequest(new { message = "Numbers must be non-negative (guard must be positive)." });
        }
        if (!string.IsNullOrWhiteSpace(patch.BusinessHoursTimeZone))
        {
            try
            {
                _ = TimeZoneInfo.FindSystemTimeZoneById(patch.BusinessHoursTimeZone);
            }
            catch (TimeZoneNotFoundException)
            {
                return BadRequest(new { message = $"Unknown time zone “{patch.BusinessHoursTimeZone}”. Use IANA (Europe/Moscow) or Windows names." });
            }
        }

        var actor = SupportUserContext.FromClaims(User).Email;
        // Семантика PUT здесь — «полное состояние оверлея»: null означает «как в конфиге», а не «не трогать».
        // Так одна кнопка «Reset to config» на поле — это просто отправить null.
        var saved = await _store.SaveAsync(doc =>
        {
            doc.BusinessHoursEnabled = patch.BusinessHoursEnabled;
            doc.BusinessHoursTimeZone = string.IsNullOrWhiteSpace(patch.BusinessHoursTimeZone) ? null : patch.BusinessHoursTimeZone.Trim();
            doc.BusinessHoursStart = patch.BusinessHoursStart;
            doc.BusinessHoursEnd = patch.BusinessHoursEnd;
            doc.ExpectedWaitMinutes = patch.ExpectedWaitMinutes;
            doc.SpecialistEmail = string.IsNullOrWhiteSpace(patch.SpecialistEmail) ? null : patch.SpecialistEmail.Trim();
            doc.LlmDailyBudgetUsd = patch.LlmDailyBudgetUsd;
            doc.NotifyTelegramOnEscalation = patch.NotifyTelegramOnEscalation;
            doc.NotifyEmailOnEscalation = patch.NotifyEmailOnEscalation;
            doc.FxMarkupPercent = patch.FxMarkupPercent;
            doc.FxMaxChangePercent = patch.FxMaxChangePercent;
            doc.CardEnabled = patch.CardEnabled;
            doc.CryptoEnabled = patch.CryptoEnabled;
            doc.StarsEnabled = patch.StarsEnabled;
        }, actor);

        return Ok(new { ok = true, message = "Settings saved and applied.", updatedAtUtc = saved.UpdatedAtUtc, updatedBy = saved.UpdatedBy });
    }

    private static object Field<T>(T effective, T? fromConfig, T? overrideValue) =>
        new { value = effective, defaultValue = fromConfig, overridden = overrideValue is not null };
}

/// <summary>Полное состояние оверлея. null в поле — «как в конфиге».</summary>
public class SiteSettingsPatch
{
    public bool? BusinessHoursEnabled { get; set; }
    public string? BusinessHoursTimeZone { get; set; }
    public int? BusinessHoursStart { get; set; }
    public int? BusinessHoursEnd { get; set; }
    public int? ExpectedWaitMinutes { get; set; }
    public string? SpecialistEmail { get; set; }
    public decimal? LlmDailyBudgetUsd { get; set; }
    public bool? NotifyTelegramOnEscalation { get; set; }
    public bool? NotifyEmailOnEscalation { get; set; }
    public decimal? FxMarkupPercent { get; set; }
    public decimal? FxMaxChangePercent { get; set; }
    public bool? CardEnabled { get; set; }
    public bool? CryptoEnabled { get; set; }
    public bool? StarsEnabled { get; set; }
}
