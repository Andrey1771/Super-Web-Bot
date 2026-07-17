using Microsoft.Extensions.Options;
using MongoDB.Driver;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Mail;

namespace SuperBot.WebApi.Newsletter;

/// <summary>
/// Исполняемая логика рассылки, отделённая от расписания (NewsletterSendWorker):
/// так интеграционные тесты прогоняют пайплайн детерминированно, без таймеров.
/// </summary>
public interface INewsletterDispatcher
{
    /// <summary>Забирает ОДНУ кампанию из очереди и отправляет. true — кампания обработана, false — очередь пуста.</summary>
    Task<bool> ProcessQueuedCampaignAsync(CancellationToken ct);

    /// <summary>
    /// Ставит в очередь дайджест скидок, ставших активными со времени прошлого прогона.
    /// Не чаще, чем раз в DigestInterval; окно двигается даже при пустом результате.
    /// true — дайджест поставлен в очередь.
    /// </summary>
    Task<bool> MaybeQueueDealsDigestAsync(CancellationToken ct);
}

public class NewsletterDispatcher : INewsletterDispatcher
{
    private const string DigestStateId = "deals-digest";
    private static readonly TimeSpan DigestInterval = TimeSpan.FromHours(24);
    private static readonly TimeSpan PerMailDelay = TimeSpan.FromMilliseconds(150);

    private readonly INewsletterService _newsletter;
    private readonly IMailSender _mail;
    private readonly IGameRepository _gameRepository;
    private readonly IGameDiscountRepository _discountRepository;
    private readonly MailOptions _mailOptions;
    private readonly ILogger<NewsletterDispatcher> _logger;

    public NewsletterDispatcher(
        INewsletterService newsletter,
        IMailSender mail,
        IGameRepository gameRepository,
        IGameDiscountRepository discountRepository,
        IOptions<MailOptions> mailOptions,
        ILogger<NewsletterDispatcher> logger)
    {
        _newsletter = newsletter;
        _mail = mail;
        _gameRepository = gameRepository;
        _discountRepository = discountRepository;
        _mailOptions = mailOptions.Value;
        _logger = logger;
    }

    public async Task<bool> ProcessQueuedCampaignAsync(CancellationToken ct)
    {
        // Атомарно забираем одну кампанию из очереди (queued → sending) —
        // защита от двойной отправки, даже если запущено несколько инстансов.
        // Запланированные (ScheduledAt в будущем) лежат в очереди, пока их время не придёт.
        var now = DateTime.UtcNow;
        var due = Builders<NewsletterCampaignDb>.Filter.Eq(c => c.Status, CampaignStatus.Queued) &
                  (Builders<NewsletterCampaignDb>.Filter.Eq(c => c.ScheduledAt, null) |
                   Builders<NewsletterCampaignDb>.Filter.Lte(c => c.ScheduledAt, now));
        var campaign = await _newsletter.Campaigns.FindOneAndUpdateAsync(
            due,
            Builders<NewsletterCampaignDb>.Update.Set(c => c.Status, CampaignStatus.Sending),
            new FindOneAndUpdateOptions<NewsletterCampaignDb> { ReturnDocument = ReturnDocument.After },
            ct);

        if (campaign is null)
        {
            return false;
        }

        var recipients = await _newsletter.GetConfirmedAsync(ct);
        if (!string.IsNullOrEmpty(campaign.Locale))
        {
            // Языковая кампания (дайджест): только подписчики с этим языком.
            recipients = recipients
                .Where(s => EmailTemplates.Normalize(s.Locale) == campaign.Locale)
                .ToList();
        }
        _logger.LogInformation("Sending campaign {Id} \"{Subject}\" (locale: {Locale}) to {Count} subscribers",
            campaign.Id, campaign.Subject, campaign.Locale ?? "all", recipients.Count);

        var sent = 0;
        var failed = 0;
        foreach (var subscriber in recipients)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                var (text, html) = _newsletter.WrapEmail(campaign.BodyText, subscriber);
                await _mail.SendAsync(subscriber.Email, campaign.Subject, text, html, ct);
                sent++;
            }
            catch (Exception ex)
            {
                failed++;
                _logger.LogWarning(ex, "Campaign {Id}: failed to send to {Email}", campaign.Id, subscriber.Email);
            }

            await Task.Delay(PerMailDelay, ct);
        }

        var finalStatus = failed > 0 && sent == 0 ? CampaignStatus.Failed : CampaignStatus.Sent;
        await _newsletter.Campaigns.UpdateOneAsync(
            c => c.Id == campaign.Id,
            Builders<NewsletterCampaignDb>.Update
                .Set(c => c.Status, finalStatus)
                .Set(c => c.RecipientCount, recipients.Count)
                .Set(c => c.SentCount, sent)
                .Set(c => c.FailedCount, failed)
                .Set(c => c.CompletedAt, DateTime.UtcNow),
            cancellationToken: ct);

        _logger.LogInformation("Campaign {Id} finished: {Sent} sent, {Failed} failed", campaign.Id, sent, failed);
        return true;
    }

    public async Task<bool> MaybeQueueDealsDigestAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var state = await _newsletter.State.Find(s => s.Id == DigestStateId).FirstOrDefaultAsync(ct);
        var lastRun = state?.LastRunAt ?? now.AddDays(-1); // первый запуск: смотрим сутки назад

        if (now - lastRun < DigestInterval)
        {
            return false;
        }

        var games = await _gameRepository.GetAllAsync();
        var gameIds = games.Select(g => g.Id).Where(id => !string.IsNullOrWhiteSpace(id)).ToList();
        var discounts = await _discountRepository.GetByGameIdsAsync(gameIds!);
        var gameById = games.Where(g => g.Id != null).ToDictionary(g => g.Id!, g => g);

        // Скидки, СТАВШИЕ активными со времени прошлого дайджеста (и всё ещё активные).
        var fresh = discounts
            .Where(d => d.IsActiveAt(now) && d.StartDate > lastRun && gameById.ContainsKey(d.GameId))
            .OrderByDescending(d => d.DiscountPercent)
            .Take(12)
            .ToList();

        // Окно двигаем в любом случае — иначе давно начавшаяся скидка «всплывёт» через неделю.
        await _newsletter.State.ReplaceOneAsync(
            s => s.Id == DigestStateId,
            new NewsletterStateDb { Id = DigestStateId, LastRunAt = now },
            new ReplaceOptions { IsUpsert = true },
            ct);

        if (fresh.Count == 0)
        {
            return false;
        }

        // Дайджест локализован: одна кампания на каждый язык, среди которых есть подписчики.
        var subscribers = await _newsletter.GetConfirmedAsync(ct);
        if (subscribers.Count == 0)
        {
            return false;
        }

        var baseUrl = _mailOptions.PublicBaseUrl.TrimEnd('/');
        var lines = string.Join("\n", fresh.Select(d =>
        {
            var game = gameById[d.GameId];
            var finalPrice = Math.Round(game.Price * (1 - d.DiscountPercent / 100m), 2, MidpointRounding.AwayFromZero);
            return $"• {game.Title} — ${game.Price:0.00} → ${finalPrice:0.00} (-{d.DiscountPercent:0}%)";
        }));

        foreach (var localeGroup in subscribers.GroupBy(s => EmailTemplates.Normalize(s.Locale)))
        {
            var strings = EmailTemplates.For(localeGroup.Key);
            var body =
                $"{strings.DigestIntro}\n\n" +
                lines +
                $"\n\n{strings.DigestOutro}\n" +
                $"{strings.DigestSeeAll} {baseUrl}/deals";

            var campaign = new NewsletterCampaignDb
            {
                Type = CampaignType.Digest,
                Subject = string.Format(strings.DigestSubject, fresh.Count),
                BodyText = body,
                Status = CampaignStatus.Queued,
                CreatedBy = "auto-digest",
                Locale = localeGroup.Key,
                CreatedAt = now,
            };
            await _newsletter.Campaigns.InsertOneAsync(campaign, cancellationToken: ct);
            _logger.LogInformation("Queued deals digest ({Locale}) with {Count} discounts for {Subscribers} subscribers",
                localeGroup.Key, fresh.Count, localeGroup.Count());
        }
        return true;
    }
}
