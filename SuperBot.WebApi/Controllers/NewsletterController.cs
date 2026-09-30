using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using SuperBot.WebApi.Newsletter;
using SuperBot.Common.Auth;
using SuperBot.WebApi.Services;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Публичная часть рассылки.
/// Пайплайн гостя: subscribe (double opt-in) → письмо → confirm по токену → confirmed.
/// Владелец аккаунта: GET/PUT /me — мгновенно, без подтверждения (email верифицирован Keycloak).
/// Отписка: постоянная токен-ссылка из футера каждого письма.
/// </summary>
[ApiController]
[Route("api/newsletter")]
public partial class NewsletterController : ControllerBase
{
    private const int MaxRequestsPerIpPerHour = 6;

    private readonly INewsletterService _newsletter;
    private readonly IMemoryCache _cache;

    public NewsletterController(INewsletterService newsletter, IMemoryCache cache)
    {
        _newsletter = newsletter;
        _cache = cache;
    }

    [HttpPost("subscribe")]
    public async Task<IActionResult> Subscribe([FromBody] SubscribeRequest request, CancellationToken ct)
    {
        var email = request.Email?.Trim().ToLowerInvariant() ?? string.Empty;
        if (email.Length is < 5 or > 254 || !EmailRegex().IsMatch(email))
        {
            return BadRequest(new { error = "Please enter a valid email address." });
        }

        // Простой анти-спам: живому человеку хватает нескольких подписок с одного IP в час.
        var cacheKey = $"newsletter-subscribe:{ClientAddress.ResolveOrUnknown(HttpContext)}";
        _cache.TryGetValue(cacheKey, out int attempts);
        if (attempts >= MaxRequestsPerIpPerHour)
        {
            return StatusCode(StatusCodes.Status429TooManyRequests,
                new { error = "Too many requests. Please try again later." });
        }
        _cache.Set(cacheKey, attempts + 1, TimeSpan.FromHours(1));

        var source = string.IsNullOrWhiteSpace(request.Source) ? "site" : request.Source.Trim().ToLowerInvariant();
        if (source.Length > 40)
        {
            source = source[..40];
        }

        var locale = string.IsNullOrWhiteSpace(request.Locale) ? null : request.Locale.Trim().ToLowerInvariant();
        if (locale is { Length: > 8 })
        {
            locale = locale[..8];
        }

        // Галочка «письма о скидках»: не пришла — считаем согласием, как и было до неё.
        var status = await _newsletter.SubscribeAsync(
            email, source, locale, request.DealAlerts ?? true, User.GetUserId(), GetUserEmail(), ct);

        // "pending" → фронт просит проверить почту; "confirmed" → подписка активна сразу.
        return Ok(new { status });
    }

    [HttpPost("confirm")]
    public async Task<IActionResult> Confirm([FromBody] TokenRequest request, CancellationToken ct)
    {
        var ok = await _newsletter.ConfirmAsync(request.Token ?? string.Empty, ct);
        return ok
            ? Ok(new { confirmed = true })
            : NotFound(new { error = "This confirmation link is invalid or was already used." });
    }

    [HttpPost("unsubscribe")]
    public async Task<IActionResult> Unsubscribe([FromBody] TokenRequest request, CancellationToken ct)
    {
        var ok = await _newsletter.UnsubscribeAsync(request.Token ?? string.Empty, ct);
        return ok
            ? Ok(new { unsubscribed = true })
            : NotFound(new { error = "This unsubscribe link is invalid." });
    }

    /// <summary>Личный кабинет: статус подписки для email текущего аккаунта.</summary>
    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> GetMy(CancellationToken ct)
    {
        var email = GetUserEmail();
        if (string.IsNullOrWhiteSpace(email))
        {
            return Ok(new { subscribed = false, status = (string?)null });
        }

        var subscriber = await _newsletter.GetByEmailAsync(email.Trim().ToLowerInvariant(), ct);
        return Ok(new
        {
            subscribed = subscriber?.Status == SubscriberStatus.Confirmed,
            status = subscriber?.Status,
            // Подписки без явного выбора считаются согласными — так их и трактует рассылка.
            dealAlerts = subscriber?.DealAlerts != false,
        });
    }

    /// <summary>Личный кабинет: включить/выключить рассылку. Без double opt-in — email уже верифицирован.</summary>
    [HttpPut("me")]
    [Authorize]
    public async Task<IActionResult> SetMy([FromBody] SetMyRequest request, CancellationToken ct)
    {
        var email = GetUserEmail();
        var userId = User.GetUserId();
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(userId))
        {
            return BadRequest(new { error = "Your account has no email address." });
        }

        var subscriber = await _newsletter.SetForAccountAsync(
            email.Trim().ToLowerInvariant(), userId, request.Subscribed, request.DealAlerts, ct);
        return Ok(new
        {
            subscribed = subscriber.Status == SubscriberStatus.Confirmed,
            status = subscriber.Status,
            dealAlerts = subscriber.DealAlerts != false,
        });
    }

    private string? GetUserEmail() =>
        User.FindFirstValue("email") ?? User.FindFirstValue(ClaimTypes.Email);

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    private static partial Regex EmailRegex();

    public class SubscribeRequest
    {
        public string? Email { get; set; }
        public string? Source { get; set; }
        public string? Locale { get; set; }

        /// <summary>Слать ли дайджест новых скидок. null — форма не спрашивала, значит да.</summary>
        public bool? DealAlerts { get; set; }
    }

    public class TokenRequest
    {
        public string? Token { get; set; }
    }

    public class SetMyRequest
    {
        public bool Subscribed { get; set; }

        /// <summary>Письма о новых скидках. null — настройка не менялась, прежний выбор остаётся.</summary>
        public bool? DealAlerts { get; set; }
    }
}
