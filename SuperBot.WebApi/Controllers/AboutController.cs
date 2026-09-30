using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.WebApi.Services;
using SuperBot.WebApi.Services.SiteSettings;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Цифры страницы «О нас». Публично: это те же факты, что видит любой посетитель,
/// и прятать их за входом смысла нет.
/// </summary>
[ApiController]
[Route("api/about")]
[AllowAnonymous]
public class AboutController : ControllerBase
{
    private readonly AboutStatsService _stats;
    private readonly SiteSettingsStore _settings;

    public AboutController(AboutStatsService stats, SiteSettingsStore settings)
    {
        _stats = stats;
        _settings = settings;
    }

    [HttpGet("stats")]
    public async Task<ActionResult<AboutStatsDto>> Stats(CancellationToken ct)
    {
        return Ok(await _stats.GetAsync(ct));
    }

    /// <summary>
    /// Люди в разделе «Meet the team». Отдельно от цифр: цифры считаются агрегатами и
    /// кэшируются на десять минут, а команду правят руками в админке и увидеть правку
    /// хочется сразу.
    /// </summary>
    [HttpGet("team")]
    public ActionResult<IReadOnlyList<TeamMember>> Team()
    {
        return Ok(TeamMembers.Localize(TeamMembers.Parse(_settings.Current.TeamJson), BuyerLanguage.Resolve(Request)));
    }

    /// <summary>Ссылки на соцсети магазина для подвала. Пустой список — блок соцсетей не показывается.</summary>
    [HttpGet("social")]
    public ActionResult<IReadOnlyList<SocialLink>> Social()
    {
        return Ok(SocialLinks.Parse(_settings.Current.SocialLinksJson));
    }
}
