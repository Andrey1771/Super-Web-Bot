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
    private readonly IOptionsSnapshot<StockOptions> _stock;
    private readonly SuperBot.Core.Regions.IRegionCatalogProvider _regions;
    private readonly IOptions<StripeSettings> _stripe;
    private readonly BtcPayOptions _btcPay;

    public AdminSiteSettingsController(
        SiteSettingsStore store,
        IConfiguration configuration,
        IOptionsSnapshot<SupportChatOptions> chat,
        IOptionsSnapshot<FxOptions> fx,
        IOptionsSnapshot<PaymentRailsOptions> rails,
        IOptionsSnapshot<StockOptions> stock,
        SuperBot.Core.Regions.IRegionCatalogProvider regions,
        IOptions<StripeSettings> stripe,
        IOptions<BtcPayOptions> btcPay)
    {
        _store = store;
        _configuration = configuration;
        _chat = chat;
        _fx = fx;
        _rails = rails;
        _stock = stock;
        _regions = regions;
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
        var cfgStock = _configuration.GetSection("Storefront:Stock");

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
            stock = new
            {
                lowStockThreshold = Field(_stock.Value.LowStockThreshold, cfgStock.GetValue<int?>("LowStockThreshold") ?? 3, doc.LowStockThreshold),
            },
            team = new
            {
                // Дефолта нет намеренно: пустой список — это «раздел не показываем»,
                // а не «показываем заготовку».
                value = SuperBot.WebApi.Services.SiteSettings.TeamMembers.Parse(doc.TeamJson),
                maxMembers = SuperBot.WebApi.Services.SiteSettings.TeamMembers.MaxMembers,
            },
            social = new
            {
                value = SocialLinks.Parse(doc.SocialLinksJson),
                // Сети, для которых у подвала есть иконка, — форма админки строит поля по этому списку.
                networks = SocialLinks.Networks.Select(n => new { network = n.Network, title = n.Title, example = n.Example }),
            },
            regions = new
            {
                // Текущий справочник (с учётом настроек) и флаг, переопределён ли он; дефолт — зашитый набор.
                value = _regions.Current.Regions,
                defaultValue = SuperBot.Core.Regions.RegionCatalog.Default(),
                overridden = !string.IsNullOrWhiteSpace(doc.RegionsJson),
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
                return BadRequest(new { message = $"Unknown time zone “{patch.BusinessHoursTimeZone}”. Use IANA (Europe/Berlin) or Windows names." });
            }
        }

        var socialError = SocialLinks.Validate(patch.Social);
        if (socialError is not null)
        {
            return BadRequest(new { message = socialError });
        }

        var actor = SupportUserContext.FromClaims(User).Email;
        // Семантика PUT здесь — «полное состояние оверлея»: null означает «как в конфиге», а не «не трогать».
        // Кэшбэк сюда не входит: его настройки сохраняет своя вкладка (AdminCashbackController), и эти поля документа не трогаются.
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
            doc.LowStockThreshold = patch.LowStockThreshold is < 0 ? null : patch.LowStockThreshold;
            doc.TeamJson = patch.Team is { Count: > 0 }
                ? SuperBot.WebApi.Services.SiteSettings.TeamMembers.Serialize(patch.Team)
                : null;
            doc.SocialLinksJson = SocialLinks.Normalize(patch.Social) is { Count: > 0 } social
                ? SocialLinks.Serialize(social)
                : null;
            doc.RegionsJson = patch.Regions is { Count: > 0 }
                ? System.Text.Json.JsonSerializer.Serialize(SuperBot.WebApi.Services.Regions.RegionCatalogProvider.Normalize(patch.Regions))
                : null;
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
    public int? LowStockThreshold { get; set; }
    /// <summary>Раздел «Meet the team» целиком; пусто/null — раздела на странице нет.</summary>
    public List<SuperBot.WebApi.Services.SiteSettings.TeamMember>? Team { get; set; }

    /// <summary>Ссылки на соцсети в подвале; пусто/null — блока соцсетей нет.</summary>
    public List<SocialLink>? Social { get; set; }

    /// <summary>Справочник регионов целиком; пусто/null — вернуться к конфигу/дефолту.</summary>
    public List<SuperBot.Core.Regions.RegionDefinition>? Regions { get; set; }

}
