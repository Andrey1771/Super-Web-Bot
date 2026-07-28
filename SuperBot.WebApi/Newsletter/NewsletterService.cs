using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using SuperBot.WebApi.Mail;

namespace SuperBot.WebApi.Newsletter;

public interface INewsletterService
{
    /// <summary>
    /// Гостевая подписка (double opt-in) или мгновенная, если подписывается владелец аккаунта
    /// своим подтверждённым email. Идемпотентна; наружу namёков «адрес уже был в базе» не даёт.
    /// </summary>
    Task<string> SubscribeAsync(string email, string source, string? locale, string? authedUserId, string? authedEmail, CancellationToken ct);

    Task<bool> ConfirmAsync(string token, CancellationToken ct);
    Task<bool> UnsubscribeAsync(string token, CancellationToken ct);

    Task<NewsletterSubscriberDb?> GetByEmailAsync(string email, CancellationToken ct);

    /// <summary>Личный кабинет: включить/выключить рассылку для email аккаунта (без double opt-in — email уже верифицирован Keycloak).</summary>
    Task<NewsletterSubscriberDb> SetForAccountAsync(string email, string userId, bool subscribed, CancellationToken ct);

    Task<(List<NewsletterSubscriberDb> Items, long Total)> ListAsync(string? status, string? search, int page, int pageSize, CancellationToken ct);
    Task<NewsletterStats> GetStatsAsync(CancellationToken ct);
    Task<string> ExportCsvAsync(CancellationToken ct);

    Task<NewsletterCampaignDb> QueueCampaignAsync(string subject, string bodyText, string? createdBy, DateTime? scheduledAt, CancellationToken ct);
    Task<List<NewsletterCampaignDb>> ListCampaignsAsync(int limit, CancellationToken ct);
    Task SendTestAsync(string to, string subject, string bodyText, CancellationToken ct);

    /// <summary>Все адреса, которым можно слать (status=confirmed).</summary>
    Task<List<NewsletterSubscriberDb>> GetConfirmedAsync(CancellationToken ct);

    IMongoCollection<NewsletterCampaignDb> Campaigns { get; }
    IMongoCollection<NewsletterStateDb> State { get; }

    string BuildUnsubscribeFooter(NewsletterSubscriberDb subscriber);

    /// <summary>Язык футера/кнопки: явный locale, иначе Locale подписчика, иначе английский.</summary>
    (string Text, string Html) WrapEmail(string bodyText, NewsletterSubscriberDb? subscriber, EmailCta? cta = null, string? locale = null);
}

public class NewsletterStats
{
    public long Confirmed { get; set; }
    public long Pending { get; set; }
    public long Unsubscribed { get; set; }
    public long NewLast30Days { get; set; }
    public Dictionary<string, long> BySource { get; set; } = new();
}

public class NewsletterService : INewsletterService
{
    private readonly IMongoCollection<NewsletterSubscriberDb> _subscribers;
    private readonly IMailSender _mail;
    private readonly MailOptions _mailOptions;
    private readonly ILogger<NewsletterService> _logger;

    public IMongoCollection<NewsletterCampaignDb> Campaigns { get; }
    public IMongoCollection<NewsletterStateDb> State { get; }

    public NewsletterService(
        IMongoDatabase database,
        IMailSender mail,
        IOptions<MailOptions> mailOptions,
        ILogger<NewsletterService> logger)
    {
        _subscribers = database.GetCollection<NewsletterSubscriberDb>("NewsletterSubscribers");
        Campaigns = database.GetCollection<NewsletterCampaignDb>("NewsletterCampaigns");
        State = database.GetCollection<NewsletterStateDb>("NewsletterState");
        _mail = mail;
        _mailOptions = mailOptions.Value;
        _logger = logger;
    }

    private static string NewToken() => Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();

    private string BaseUrl => _mailOptions.PublicBaseUrl.TrimEnd('/');

    public async Task<string> SubscribeAsync(string email, string source, string? locale, string? authedUserId, string? authedEmail, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var existing = await _subscribers.Find(s => s.Email == email).FirstOrDefaultAsync(ct);

        // Владелец аккаунта подписывает собственный email: Keycloak его уже верифицировал,
        // второе подтверждение — лишняя фрикция. Подтверждаем сразу.
        var instantConfirm = !string.IsNullOrWhiteSpace(authedEmail) &&
                             string.Equals(authedEmail.Trim().ToLowerInvariant(), email, StringComparison.Ordinal);

        if (existing is null)
        {
            var subscriber = new NewsletterSubscriberDb
            {
                Email = email,
                Status = instantConfirm ? SubscriberStatus.Confirmed : SubscriberStatus.Pending,
                Sources = new List<string> { source },
                UserId = instantConfirm ? authedUserId : null,
                Locale = locale,
                ConfirmToken = instantConfirm ? null : NewToken(),
                UnsubscribeToken = NewToken(),
                CreatedAt = now,
                UpdatedAt = now,
                ConfirmedAt = instantConfirm ? now : null,
            };
            await _subscribers.InsertOneAsync(subscriber, cancellationToken: ct);

            if (!instantConfirm)
            {
                await SendConfirmEmailAsync(subscriber, ct);
            }
            return subscriber.Status;
        }

        // Существующий адрес: добавляем источник, дальше — по статусу.
        var update = Builders<NewsletterSubscriberDb>.Update
            .AddToSet(s => s.Sources, source)
            .Set(s => s.UpdatedAt, now);

        if (existing.Status == SubscriberStatus.Confirmed)
        {
            await _subscribers.UpdateOneAsync(s => s.Id == existing.Id, update, cancellationToken: ct);
            return SubscriberStatus.Confirmed;
        }

        if (instantConfirm)
        {
            update = update
                .Set(s => s.Status, SubscriberStatus.Confirmed)
                .Set(s => s.ConfirmedAt, now)
                .Set(s => s.ConfirmToken, (string?)null)
                .Set(s => s.UserId, authedUserId);
            await _subscribers.UpdateOneAsync(s => s.Id == existing.Id, update, cancellationToken: ct);
            return SubscriberStatus.Confirmed;
        }

        // pending → перевысылаем подтверждение; unsubscribed → повторный opt-in c новым токеном.
        var confirmToken = existing.ConfirmToken ?? NewToken();
        update = update
            .Set(s => s.Status, SubscriberStatus.Pending)
            .Set(s => s.ConfirmToken, confirmToken);
        await _subscribers.UpdateOneAsync(s => s.Id == existing.Id, update, cancellationToken: ct);

        existing.ConfirmToken = confirmToken;
        await SendConfirmEmailAsync(existing, ct);
        return SubscriberStatus.Pending;
    }

    public async Task<bool> ConfirmAsync(string token, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return false;
        }

        var now = DateTime.UtcNow;
        var update = Builders<NewsletterSubscriberDb>.Update
            .Set(s => s.Status, SubscriberStatus.Confirmed)
            .Set(s => s.ConfirmedAt, now)
            .Set(s => s.UpdatedAt, now)
            .Set(s => s.ConfirmToken, (string?)null);

        var result = await _subscribers.UpdateOneAsync(s => s.ConfirmToken == token, update, cancellationToken: ct);
        return result.ModifiedCount > 0;
    }

    public async Task<bool> UnsubscribeAsync(string token, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return false;
        }

        var now = DateTime.UtcNow;
        var subscriber = await _subscribers.Find(s => s.UnsubscribeToken == token).FirstOrDefaultAsync(ct);
        if (subscriber is null)
        {
            return false;
        }

        // Идемпотентно: повторный клик по старой ссылке — тоже успех.
        if (subscriber.Status != SubscriberStatus.Unsubscribed)
        {
            var update = Builders<NewsletterSubscriberDb>.Update
                .Set(s => s.Status, SubscriberStatus.Unsubscribed)
                .Set(s => s.UnsubscribedAt, now)
                .Set(s => s.UpdatedAt, now);
            await _subscribers.UpdateOneAsync(s => s.Id == subscriber.Id, update, cancellationToken: ct);
        }
        return true;
    }

    public Task<NewsletterSubscriberDb?> GetByEmailAsync(string email, CancellationToken ct) =>
        _subscribers.Find(s => s.Email == email).FirstOrDefaultAsync(ct)!;

    public async Task<NewsletterSubscriberDb> SetForAccountAsync(string email, string userId, bool subscribed, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var existing = await _subscribers.Find(s => s.Email == email).FirstOrDefaultAsync(ct);

        if (existing is null)
        {
            var subscriber = new NewsletterSubscriberDb
            {
                Email = email,
                Status = subscribed ? SubscriberStatus.Confirmed : SubscriberStatus.Unsubscribed,
                Sources = new List<string> { "account" },
                UserId = userId,
                UnsubscribeToken = NewToken(),
                CreatedAt = now,
                UpdatedAt = now,
                ConfirmedAt = subscribed ? now : null,
                UnsubscribedAt = subscribed ? null : now,
            };
            await _subscribers.InsertOneAsync(subscriber, cancellationToken: ct);
            return subscriber;
        }

        var update = Builders<NewsletterSubscriberDb>.Update
            .Set(s => s.UserId, userId)
            .Set(s => s.UpdatedAt, now)
            .AddToSet(s => s.Sources, "account")
            .Set(s => s.ConfirmToken, (string?)null)
            .Set(s => s.Status, subscribed ? SubscriberStatus.Confirmed : SubscriberStatus.Unsubscribed);

        update = subscribed
            ? update.Set(s => s.ConfirmedAt, existing.ConfirmedAt ?? now)
            : update.Set(s => s.UnsubscribedAt, now);

        await _subscribers.UpdateOneAsync(s => s.Id == existing.Id, update, cancellationToken: ct);
        return (await _subscribers.Find(s => s.Id == existing.Id).FirstAsync(ct));
    }

    public async Task<(List<NewsletterSubscriberDb> Items, long Total)> ListAsync(string? status, string? search, int page, int pageSize, CancellationToken ct)
    {
        var filter = Builders<NewsletterSubscriberDb>.Filter.Empty;
        if (!string.IsNullOrWhiteSpace(status))
        {
            filter &= Builders<NewsletterSubscriberDb>.Filter.Eq(s => s.Status, status);
        }
        if (!string.IsNullOrWhiteSpace(search))
        {
            filter &= Builders<NewsletterSubscriberDb>.Filter.Regex(
                s => s.Email, new MongoDB.Bson.BsonRegularExpression(Regex.Escape(search.Trim().ToLowerInvariant()), "i"));
        }

        var total = await _subscribers.CountDocumentsAsync(filter, cancellationToken: ct);
        var items = await _subscribers.Find(filter)
            .SortByDescending(s => s.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Limit(pageSize)
            .ToListAsync(ct);
        return (items, total);
    }

    public async Task<NewsletterStats> GetStatsAsync(CancellationToken ct)
    {
        var since = DateTime.UtcNow.AddDays(-30);
        var stats = new NewsletterStats
        {
            Confirmed = await _subscribers.CountDocumentsAsync(s => s.Status == SubscriberStatus.Confirmed, cancellationToken: ct),
            Pending = await _subscribers.CountDocumentsAsync(s => s.Status == SubscriberStatus.Pending, cancellationToken: ct),
            Unsubscribed = await _subscribers.CountDocumentsAsync(s => s.Status == SubscriberStatus.Unsubscribed, cancellationToken: ct),
            NewLast30Days = await _subscribers.CountDocumentsAsync(s => s.CreatedAt >= since, cancellationToken: ct),
        };

        // Источники: адресов немного, считаем в памяти — без агрегационного пайплайна.
        var all = await _subscribers.Find(FilterDefinition<NewsletterSubscriberDb>.Empty)
            .Project(s => s.Sources)
            .ToListAsync(ct);
        foreach (var sources in all)
        {
            foreach (var source in sources ?? new List<string>())
            {
                stats.BySource[source] = stats.BySource.GetValueOrDefault(source) + 1;
            }
        }
        return stats;
    }

    public async Task<string> ExportCsvAsync(CancellationToken ct)
    {
        var items = await _subscribers.Find(FilterDefinition<NewsletterSubscriberDb>.Empty)
            .SortByDescending(s => s.CreatedAt)
            .ToListAsync(ct);

        var sb = new StringBuilder();
        sb.AppendLine("Email,Status,Sources,CreatedAt,ConfirmedAt,UnsubscribedAt");
        foreach (var s in items)
        {
            sb.AppendLine(string.Join(",",
                s.Email,
                s.Status,
                $"\"{string.Join(";", s.Sources)}\"",
                s.CreatedAt.ToString("O"),
                s.ConfirmedAt?.ToString("O") ?? "",
                s.UnsubscribedAt?.ToString("O") ?? ""));
        }
        return sb.ToString();
    }

    public async Task<NewsletterCampaignDb> QueueCampaignAsync(string subject, string bodyText, string? createdBy, DateTime? scheduledAt, CancellationToken ct)
    {
        var campaign = new NewsletterCampaignDb
        {
            Type = CampaignType.Manual,
            Subject = subject,
            BodyText = bodyText,
            Status = CampaignStatus.Queued,
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow,
            ScheduledAt = scheduledAt,
        };
        await Campaigns.InsertOneAsync(campaign, cancellationToken: ct);
        return campaign;
    }

    public Task<List<NewsletterCampaignDb>> ListCampaignsAsync(int limit, CancellationToken ct) =>
        Campaigns.Find(FilterDefinition<NewsletterCampaignDb>.Empty)
            .SortByDescending(c => c.CreatedAt)
            .Limit(limit)
            .ToListAsync(ct);

    public Task<List<NewsletterSubscriberDb>> GetConfirmedAsync(CancellationToken ct) =>
        _subscribers.Find(s => s.Status == SubscriberStatus.Confirmed).ToListAsync(ct);

    public async Task SendTestAsync(string to, string subject, string bodyText, CancellationToken ct)
    {
        var (text, html) = WrapEmail(bodyText, subscriber: null);
        await _mail.SendAsync(to, $"[TEST] {subject}", text, html, ct);
    }

    // ---------- письма ----------

    private async Task SendConfirmEmailAsync(NewsletterSubscriberDb subscriber, CancellationToken ct)
    {
        // Текст на языке сайта, с которого подписались (Locale подписчика); fallback — английский.
        var strings = EmailTemplates.For(subscriber.Locale);
        var link = $"{BaseUrl}/newsletter/confirm?token={subscriber.ConfirmToken}";

        // Без unsubscribe-футера: подписки ещё нет. CTA даёт кнопку в HTML и "label: url" в тексте.
        var (text, html) = WrapEmail(
            strings.ConfirmBody,
            subscriber: null,
            cta: new EmailCta(strings.ConfirmCta, link),
            locale: subscriber.Locale);
        try
        {
            await _mail.SendAsync(subscriber.Email, strings.ConfirmSubject, text, html, ct);
        }
        catch (Exception ex)
        {
            // Подписчик остаётся pending; повторная отправка формы перевышлет письмо.
            _logger.LogWarning(ex, "Failed to send confirmation email to {Email}", subscriber.Email);
        }
    }

    public string BuildUnsubscribeFooter(NewsletterSubscriberDb subscriber)
    {
        var strings = EmailTemplates.For(subscriber.Locale);
        return $"{strings.FooterReason}\n{strings.FooterUnsubscribe}: {BaseUrl}/newsletter/unsubscribe?token={subscriber.UnsubscribeToken}";
    }

    public (string Text, string Html) WrapEmail(string bodyText, NewsletterSubscriberDb? subscriber, EmailCta? cta = null, string? locale = null)
    {
        var strings = EmailTemplates.For(locale ?? subscriber?.Locale);

        var text = bodyText;
        if (cta is not null)
        {
            text += $"\n\n{cta.Label}: {cta.Url}";
        }
        if (subscriber is not null)
        {
            text += $"\n\n—\n{BuildUnsubscribeFooter(subscriber)}";
        }

        var htmlBody = EmailBodyRenderer.ToHtml(bodyText);
        var htmlCta = cta is null ? "" : EmailBodyRenderer.RenderCtaButton(cta, strings.ButtonFallback);

        var htmlFooter = "";
        if (subscriber is not null)
        {
            var unsubscribeUrl = System.Net.WebUtility.HtmlEncode(
                $"{BaseUrl}/newsletter/unsubscribe?token={subscriber.UnsubscribeToken}");
            htmlFooter =
                "<p style=\"margin-top:28px;padding-top:14px;border-top:1px solid #e9e3ff;color:#8a7fb4;font-size:12px;\">" +
                $"{System.Net.WebUtility.HtmlEncode(strings.FooterReason)}<br/>" +
                $"<a href=\"{unsubscribeUrl}\" style=\"color:#8a7fb4;text-decoration:underline;\">{System.Net.WebUtility.HtmlEncode(strings.FooterUnsubscribe)}</a>" +
                "</p>";
        }

        // Брендированный макет — Templates/EmailLayout.html (embedded resource).
        var logoUrl = string.IsNullOrWhiteSpace(BaseUrl) ? null : $"{BaseUrl}/api/email-assets/logo";
        var html = EmailTemplates.RenderLayout($"{htmlBody}{htmlCta}{htmlFooter}", logoUrl);
        return (text, html);
    }
}
