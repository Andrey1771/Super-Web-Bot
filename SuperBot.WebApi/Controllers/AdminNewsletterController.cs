using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.WebApi.Newsletter;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Админка рассылки: подписчики (список/поиск/фильтр/CSV), статистика для дашборда,
/// кампании (создать → уходит в очередь NewsletterSendWorker; тест-отправка себе — мгновенно).
/// </summary>
[ApiController]
[Route("api/admin/newsletter")]
[Authorize(Roles = "admin")]
public class AdminNewsletterController : ControllerBase
{
    private readonly INewsletterService _newsletter;

    public AdminNewsletterController(INewsletterService newsletter)
    {
        _newsletter = newsletter;
    }

    [HttpGet("subscribers")]
    public async Task<IActionResult> GetSubscribers(
        [FromQuery] string? status,
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var (items, total) = await _newsletter.ListAsync(status, search, page, pageSize, ct);
        return Ok(new
        {
            total,
            page,
            pageSize,
            items = items.Select(s => new
            {
                s.Id,
                s.Email,
                s.Status,
                s.Sources,
                s.Locale,
                hasAccount = !string.IsNullOrWhiteSpace(s.UserId),
                s.CreatedAt,
                s.ConfirmedAt,
                s.UnsubscribedAt,
            }),
        });
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats(CancellationToken ct)
    {
        var stats = await _newsletter.GetStatsAsync(ct);
        return Ok(stats);
    }

    [HttpGet("export")]
    public async Task<IActionResult> ExportCsv(CancellationToken ct)
    {
        var csv = await _newsletter.ExportCsvAsync(ct);
        return File(
            System.Text.Encoding.UTF8.GetBytes(csv),
            "text/csv",
            $"newsletter-subscribers-{DateTime.UtcNow:yyyy-MM-dd}.csv");
    }

    [HttpGet("campaigns")]
    public async Task<IActionResult> GetCampaigns([FromQuery] int limit = 20, CancellationToken ct = default)
    {
        var campaigns = await _newsletter.ListCampaignsAsync(Math.Clamp(limit, 1, 100), ct);
        return Ok(campaigns.Select(c => new
        {
            c.Id,
            c.Type,
            c.Locale,
            c.Subject,
            c.Status,
            c.RecipientCount,
            c.SentCount,
            c.FailedCount,
            c.CreatedBy,
            c.ScheduledAt,
            c.CreatedAt,
            c.CompletedAt,
        }));
    }

    [HttpPost("campaigns")]
    public async Task<IActionResult> CreateCampaign([FromBody] CampaignRequest request, CancellationToken ct)
    {
        var subject = request.Subject?.Trim();
        var body = request.Body?.Trim();
        if (string.IsNullOrWhiteSpace(subject) || subject.Length > 150)
        {
            return BadRequest(new { error = "Subject is required (max 150 characters)." });
        }
        if (string.IsNullOrWhiteSpace(body) || body.Length > 10_000)
        {
            return BadRequest(new { error = "Body is required (max 10 000 characters)." });
        }

        DateTime? scheduledAt = null;
        if (request.ScheduledAt is DateTime raw)
        {
            scheduledAt = raw.Kind == DateTimeKind.Utc ? raw : raw.ToUniversalTime();
            // Небольшой люфт: пока админ заполнял форму, «через минуту» могло стать прошлым.
            if (scheduledAt < DateTime.UtcNow.AddMinutes(-2))
            {
                return BadRequest(new { error = "Scheduled time is in the past." });
            }
            if (scheduledAt > DateTime.UtcNow.AddDays(90))
            {
                return BadRequest(new { error = "Scheduled time is too far in the future (max 90 days)." });
            }
        }

        var createdBy = User.FindFirstValue("email") ?? User.FindFirstValue(ClaimTypes.Email) ?? "admin";
        var campaign = await _newsletter.QueueCampaignAsync(subject, body, createdBy, scheduledAt, ct);

        // Кампания подхватывается воркером в течение ~30 секунд после наступления ScheduledAt (или сразу).
        return Ok(new { campaign.Id, campaign.Status, campaign.ScheduledAt });
    }

    /// <summary>
    /// Предпросмотр письма: тот же рендер, что и при реальной отправке (markdown-лайт + брендированная
    /// обёртка + unsubscribe-футер на примере подписчика). Ничего не сохраняет и не отправляет.
    /// </summary>
    [HttpPost("campaigns/preview")]
    public IActionResult PreviewCampaign([FromBody] CampaignRequest request)
    {
        var body = request.Body ?? "";
        if (body.Length > 10_000)
        {
            return BadRequest(new { error = "Body is too long (max 10 000 characters)." });
        }

        var sample = new NewsletterSubscriberDb { Email = "subscriber@example.com", UnsubscribeToken = "preview" };
        var (text, html) = _newsletter.WrapEmail(body, sample);
        return Ok(new { html, text });
    }

    [HttpPost("campaigns/test")]
    public async Task<IActionResult> SendTest([FromBody] TestSendRequest request, CancellationToken ct)
    {
        var to = request.To?.Trim();
        if (string.IsNullOrWhiteSpace(to) || !to.Contains('@'))
        {
            return BadRequest(new { error = "A valid recipient email is required." });
        }
        if (string.IsNullOrWhiteSpace(request.Subject) || string.IsNullOrWhiteSpace(request.Body))
        {
            return BadRequest(new { error = "Subject and body are required." });
        }

        await _newsletter.SendTestAsync(to, request.Subject.Trim(), request.Body.Trim(), ct);
        return Ok(new { sent = true });
    }

    public class CampaignRequest
    {
        public string? Subject { get; set; }
        public string? Body { get; set; }

        /// <summary>Отложенная отправка (ISO-строка от фронта); null/отсутствует — отправить сразу.</summary>
        public DateTime? ScheduledAt { get; set; }
    }

    public class TestSendRequest
    {
        public string? To { get; set; }
        public string? Subject { get; set; }
        public string? Body { get; set; }
    }
}
