using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Mail;
using SuperBot.WebApi.Newsletter;

namespace SuperBot.WebApi.Services.ReviewInvites;

/// <summary>
/// Рассылка приглашений оставить отзыв.
///
/// Запускается расписанием раз в сутки. В отличие от напоминаний о брошенной корзине, здесь
/// автоматика уместна: человек уже купил и получил своё, письмо про его собственную покупку,
/// и решение «спросить через неделю» одинаково для всех — выбирать тут нечего.
///
/// Ровно одно письмо на заказ. Отметка ставится ДО отправки: при падении SMTP лучше не
/// написать вовсе, чем написать дважды после перезапуска задачи.
/// </summary>
public sealed class ReviewInviteService
{
    public const string InvitesCollection = "ReviewInvites";
    public const string OptOutsCollection = "ReviewInviteOptOuts";

    private readonly IMongoDatabase _database;
    private readonly IOrderRepository _orders;
    private readonly IGameReviewRepository _reviews;
    private readonly IReviewInviteMailer _mailer;
    private readonly IReviewInviteTokenService _tokens;
    private readonly ReviewInviteOptions _options;
    private readonly MailOptions _mailOptions;
    private readonly ILogger<ReviewInviteService> _logger;

    public ReviewInviteService(
        IMongoDatabase database,
        IOrderRepository orders,
        IGameReviewRepository reviews,
        IReviewInviteMailer mailer,
        IReviewInviteTokenService tokens,
        IOptions<ReviewInviteOptions> options,
        IOptions<MailOptions> mailOptions,
        ILogger<ReviewInviteService> logger)
    {
        _database = database;
        _orders = orders;
        _reviews = reviews;
        _mailer = mailer;
        _tokens = tokens;
        _options = options.Value;
        _mailOptions = mailOptions.Value;
        _logger = logger;
    }

    private IMongoCollection<ReviewInviteDb> Invites => _database.GetCollection<ReviewInviteDb>(InvitesCollection);
    private IMongoCollection<ReviewInviteOptOutDb> OptOuts => _database.GetCollection<ReviewInviteOptOutDb>(OptOutsCollection);

    /// <summary>Точка входа расписания. Hangfire игнорирует результат, админка его показывает.</summary>
    public async Task<ReviewInviteRunResult> RunAsync(CancellationToken ct = default)
    {
        if (!_options.Enabled)
        {
            return ReviewInviteRunResult.Disabled;
        }

        var now = DateTime.UtcNow;
        var since = now.AddDays(-Math.Max(1, _options.MaxAgeDays));
        var orders = await _orders.GetPaidOrdersSinceAsync(since);

        // Кандидаты сначала отбираются дешёвыми правилами (дата, оплата, наличие позиций),
        // и только по выжившим ходим в базу за отписками и отзывами. Иначе на каждый заказ
        // месячной давности пришлось бы делать два лишних запроса.
        var candidates = orders
            .Where(order => ReviewInviteRules
                .Decide(order, now, _options, alreadyInvited: false, optedOut: false, EmptySet)
                .ShouldSend)
            .OrderBy(order => ReviewInviteRules.DeliveredAt(order))
            .ToList();

        if (candidates.Count == 0)
        {
            return new ReviewInviteRunResult(true, 0, 0, 0);
        }

        var invited = await InvitedOrderIdsAsync(candidates.Select(order => order.Id.ToString()), ct);
        var optedOut = await OptedOutEmailsAsync(candidates.Select(order => order.UserName), ct);

        var sent = 0;
        var failed = 0;

        foreach (var order in candidates)
        {
            if (sent >= Math.Max(1, _options.BatchSize) || ct.IsCancellationRequested)
            {
                break;
            }

            var orderId = order.Id.ToString();
            var email = ReviewInviteTokenService.Normalize(order.UserName);
            var gameIds = (order.Items ?? new List<OrderItemSnapshot>())
                .Where(item => !string.IsNullOrWhiteSpace(item?.GameId))
                .Select(item => item!.GameId!)
                .Distinct(StringComparer.Ordinal);

            var reviewed = await _reviews.GetReviewedGameIdsAsync(order.UserId ?? string.Empty, gameIds);

            var decision = ReviewInviteRules.Decide(
                order, now, _options,
                alreadyInvited: invited.Contains(orderId),
                optedOut: optedOut.Contains(email),
                reviewed);

            if (!decision.ShouldSend)
            {
                continue;
            }

            var games = BuildGames(order, decision.GameIds);
            if (games.Count == 0)
            {
                continue;
            }

            // Отметка до отправки: повтор письма хуже, чем его отсутствие.
            if (!await TryClaimAsync(orderId, email, decision.GameIds, now, ct))
            {
                continue;
            }

            try
            {
                await _mailer.SendInviteAsync(email, games, UnsubscribeUrl(email), order.Language, ct);
                sent++;
            }
            catch (Exception ex)
            {
                failed++;
                // Отметку не снимаем: если SMTP лёг, следующая попытка через сутки разошлёт
                // всё заново, и человек получит два письма про один заказ.
                _logger.LogWarning(ex, "Review invite for order {OrderId} could not be sent.", orderId);
            }
        }

        if (sent > 0 || failed > 0)
        {
            _logger.LogInformation("Review invites: {Sent} sent, {Failed} failed.", sent, failed);
        }

        return new ReviewInviteRunResult(true, candidates.Count, sent, failed);
    }

    /// <summary>«Больше не звать» по ссылке из письма. Повторный переход безопасен.</summary>
    public async Task<bool> OptOutAsync(string token, CancellationToken ct = default)
    {
        if (!_tokens.TryValidate(token, out var email))
        {
            return false;
        }

        var normalized = ReviewInviteTokenService.Normalize(email);
        await OptOuts.UpdateOneAsync(
            Builders<ReviewInviteOptOutDb>.Filter.Eq(row => row.Email, normalized),
            Builders<ReviewInviteOptOutDb>.Update
                .SetOnInsert(row => row.Email, normalized)
                .SetOnInsert(row => row.CreatedAtUtc, DateTime.UtcNow),
            new UpdateOptions { IsUpsert = true },
            ct);

        return true;
    }

    private static readonly IReadOnlySet<string> EmptySet = new HashSet<string>(StringComparer.Ordinal);

    private string UnsubscribeUrl(string email)
    {
        var baseUrl = string.IsNullOrWhiteSpace(_mailOptions.PublicBaseUrl)
            ? string.Empty
            : _mailOptions.PublicBaseUrl.TrimEnd('/');
        return $"{baseUrl}/reviews/unsubscribe?token={_tokens.CreateToken(email)}";
    }

    private static List<ReviewInviteGame> BuildGames(Order order, IReadOnlyList<string> gameIds)
    {
        var wanted = new HashSet<string>(gameIds, StringComparer.Ordinal);
        return (order.Items ?? new List<OrderItemSnapshot>())
            .Where(item => item?.GameId is { } id && wanted.Contains(id) && !string.IsNullOrWhiteSpace(item.Slug))
            .GroupBy(item => item.GameId!, StringComparer.Ordinal)
            .Select(group => group.First())
            .Select(item => new ReviewInviteGame(
                string.IsNullOrWhiteSpace(item.Title) ? "your game" : item.Title,
                item.Slug!))
            .ToList();
    }

    private async Task<HashSet<string>> InvitedOrderIdsAsync(IEnumerable<string> orderIds, CancellationToken ct)
    {
        var ids = orderIds.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.Ordinal).ToList();
        if (ids.Count == 0)
        {
            return new HashSet<string>(StringComparer.Ordinal);
        }

        var rows = await Invites
            .Find(Builders<ReviewInviteDb>.Filter.In(row => row.OrderId, ids))
            .Project(row => row.OrderId)
            .ToListAsync(ct);

        return new HashSet<string>(rows, StringComparer.Ordinal);
    }

    /// <summary>
    /// Кому писать нельзя: явный отказ от таких писем плюс отписка от рассылки вообще.
    /// Второе учитываем намеренно — отписка, которая касается не всех писем, ничего не значит.
    /// </summary>
    private async Task<HashSet<string>> OptedOutEmailsAsync(IEnumerable<string?> emails, CancellationToken ct)
    {
        var list = emails
            .Where(email => !string.IsNullOrWhiteSpace(email) && email!.Contains('@'))
            .Select(ReviewInviteTokenService.Normalize!)
            .Distinct(StringComparer.Ordinal)
            .ToList();

        var result = new HashSet<string>(StringComparer.Ordinal);
        if (list.Count == 0)
        {
            return result;
        }

        var declined = await OptOuts
            .Find(Builders<ReviewInviteOptOutDb>.Filter.In(row => row.Email, list))
            .Project(row => row.Email)
            .ToListAsync(ct);
        foreach (var email in declined)
        {
            result.Add(email);
        }

        var subscribers = _database.GetCollection<NewsletterSubscriberDb>("NewsletterSubscribers");
        var unsubscribed = await subscribers
            .Find(Builders<NewsletterSubscriberDb>.Filter.And(
                Builders<NewsletterSubscriberDb>.Filter.In(row => row.Email, list),
                Builders<NewsletterSubscriberDb>.Filter.Eq(row => row.Status, SubscriberStatus.Unsubscribed)))
            .Project(row => row.Email)
            .ToListAsync(ct);
        foreach (var email in unsubscribed)
        {
            result.Add(email);
        }

        return result;
    }

    /// <summary>
    /// Занять заказ под отправку. Уникальный индекс по OrderId делает это безопасным при
    /// нескольких репликах: вторая просто получит дубликат ключа и промолчит.
    /// </summary>
    private async Task<bool> TryClaimAsync(
        string orderId, string email, IReadOnlyList<string> gameIds, DateTime now, CancellationToken ct)
    {
        try
        {
            await Invites.InsertOneAsync(new ReviewInviteDb
            {
                OrderId = orderId,
                Email = email,
                GameIds = gameIds.ToList(),
                SentAtUtc = now,
            }, cancellationToken: ct);
            return true;
        }
        catch (MongoWriteException ex) when (ex.WriteError?.Category == ServerErrorCategory.DuplicateKey)
        {
            return false;
        }
    }
}

/// <summary>Итог прогона: сколько заказов рассмотрели и чем кончилось. Нужен админке.</summary>
public sealed record ReviewInviteRunResult(bool Enabled, int Considered, int Sent, int Failed)
{
    public static readonly ReviewInviteRunResult Disabled = new(false, 0, 0, 0);
}

public class ReviewInviteDb
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    /// <summary>Заказ, по которому писали. Уникальный индекс — одно письмо на заказ.</summary>
    public string OrderId { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    /// <summary>О каких играх спрашивали — чтобы потом было видно, на что человек ответил.</summary>
    public List<string> GameIds { get; set; } = new();

    public DateTime SentAtUtc { get; set; }
}

public class ReviewInviteOptOutDb
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    /// <summary>Нормализованный адрес; уникальный индекс — один документ на почту.</summary>
    public string Email { get; set; } = string.Empty;

    public DateTime CreatedAtUtc { get; set; }
}
