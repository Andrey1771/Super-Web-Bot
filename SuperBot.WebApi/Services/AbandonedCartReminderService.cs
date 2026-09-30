using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;
using SuperBot.Core.Payments;
using SuperBot.Infrastructure.Data;
using SuperBot.WebApi.Mail;
using SuperBot.WebApi.Newsletter;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Напоминания о брошенных корзинах.
///
/// Рассылка запускается только руками из админки — по явно выбранным корзинам. Автоматической
/// отправки здесь нет и не предполагается: письмо уходит живому человеку, который ничего не
/// заказывал, и решение «написать» должно принимать не расписание.
///
/// Три отказа, которые сервис делает сам, не спрашивая:
/// — адрес неизвестен (гостевая корзина с анонимным идентификатором) — писать некуда;
/// — человек отписан от писем — отписка касается и напоминаний, иначе она ничего не значит;
/// — по этой же корзине напоминание уже уходило — повтор превращает напоминание в назойливость.
/// Последнее считается по состоянию корзины: если человек её потом менял, это уже другая
/// корзина, и новое напоминание допустимо.
/// </summary>
public sealed class AbandonedCartReminderService
{
    private const string RemindersCollection = "AbandonedCartReminders";

    private readonly IMongoDatabase _database;
    private readonly IAbandonedCartMailer _mailer;
    private readonly SuperBot.Core.Interfaces.IRepositories.IOrderRepository _orders;
    private readonly StorefrontCurrencyOptions _currencies;
    private readonly ILogger<AbandonedCartReminderService> _logger;

    public AbandonedCartReminderService(
        IMongoDatabase database,
        IAbandonedCartMailer mailer,
        SuperBot.Core.Interfaces.IRepositories.IOrderRepository orders,
        IOptions<StorefrontCurrencyOptions> currencies,
        ILogger<AbandonedCartReminderService> logger)
    {
        _database = database;
        _mailer = mailer;
        _orders = orders;
        _currencies = currencies.Value;
        _logger = logger;
    }

    private IMongoCollection<AbandonedCartReminderDb> Reminders =>
        _database.GetCollection<AbandonedCartReminderDb>(RemindersCollection);

    /// <summary>Когда по каждой из корзин уже отправляли напоминание. Ключ — идентификатор владельца.</summary>
    public async Task<Dictionary<string, DateTime>> SentForAsync(IEnumerable<string> userIds, CancellationToken ct = default)
    {
        var ids = userIds.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (ids.Count == 0)
        {
            return new Dictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);
        }

        var rows = await Reminders
            .Find(Builders<AbandonedCartReminderDb>.Filter.In(r => r.UserId, ids))
            .ToListAsync(ct);

        return rows
            .GroupBy(r => r.UserId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.Max(r => r.SentAtUtc), StringComparer.OrdinalIgnoreCase);
    }

    public async Task<IReadOnlyList<ReminderResultDto>> SendAsync(IReadOnlyList<string> userIds, CancellationToken ct = default)
    {
        var carts = _database.GetCollection<CartDb>("Cart");
        var subscribers = _database.GetCollection<NewsletterSubscriberDb>("NewsletterSubscribers");

        var wanted = userIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var results = new List<ReminderResultDto>();

        foreach (var userId in wanted)
        {
            var cart = await carts.Find(c => c.UserId == userId).FirstOrDefaultAsync(ct);
            var items = cart?.CartGames ?? Array.Empty<CartGameDb>();

            if (cart is null || items.Length == 0)
            {
                // Корзина опустела между построением отчёта и нажатием кнопки — писать не о чем.
                results.Add(new ReminderResultDto { UserId = userId, Status = "cart_empty" });
                continue;
            }

            if (!EmailAddress.LooksLikeEmail(userId))
            {
                results.Add(new ReminderResultDto { UserId = userId, Status = "no_address" });
                continue;
            }

            var subscriber = await subscribers
                .Find(s => s.Email == userId.ToLowerInvariant())
                .FirstOrDefaultAsync(ct);
            if (subscriber is not null && subscriber.Status == SubscriberStatus.Unsubscribed)
            {
                results.Add(new ReminderResultDto { UserId = userId, Status = "unsubscribed" });
                continue;
            }

            // Уже писали по этому же состоянию корзины — второй раз не пишем.
            var cartStamp = cart.UpdatedAt;
            var already = await Reminders
                .Find(r => r.UserId == userId && r.CartUpdatedAtUtc == cartStamp)
                .FirstOrDefaultAsync(ct);
            if (already is not null)
            {
                results.Add(new ReminderResultDto
                {
                    UserId = userId,
                    Status = "already_reminded",
                    SentAtUtc = already.SentAtUtc
                });
                continue;
            }

            var lines = items
                .Select(item => new AbandonedCartMailItem(item.Name ?? "Game", Math.Max(1, item.Quantity), item.Price))
                .ToList();
            var total = items.Sum(item => item.Price * item.Quantity);

            try
            {
                // Язык письма: язык подписки на рассылку, иначе язык последнего заказа, иначе английский.
                var locale = SuperBot.WebApi.Services.BuyerLanguage.Normalize(subscriber?.Locale)
                    ?? SuperBot.WebApi.Services.BuyerLanguage.FromOrders(await _orders.GetOrdersByUserAsync(userId));
                await _mailer.SendReminderAsync(userId, lines, total, _currencies.Base, locale, ct);
            }
            catch (Exception ex)
            {
                // Одно неотправленное письмо не должно останавливать остальные: почтовый сервер
                // может отказать по одному адресу, а по соседнему принять.
                _logger.LogWarning(ex, "Abandoned cart reminder to {UserId} failed", userId);
                results.Add(new ReminderResultDto { UserId = userId, Status = "failed" });
                continue;
            }

            var sentAt = DateTime.UtcNow;
            await Reminders.InsertOneAsync(new AbandonedCartReminderDb
            {
                Id = ObjectId.GenerateNewId().ToString(),
                UserId = userId,
                CartUpdatedAtUtc = cartStamp,
                SentAtUtc = sentAt,
                Items = lines.Sum(l => l.Quantity),
                Value = total
            }, cancellationToken: ct);

            results.Add(new ReminderResultDto { UserId = userId, Status = "sent", SentAtUtc = sentAt });
        }

        return results;
    }

}

/// <summary>Отправленное напоминание. Хранится, чтобы не написать второй раз об одном и том же.</summary>
public class AbandonedCartReminderDb
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = string.Empty;

    public string UserId { get; set; } = string.Empty;

    /// <summary>Состояние корзины, о котором писали. Изменилась — значит корзина уже другая.</summary>
    [BsonIgnoreIfNull]
    public DateTime? CartUpdatedAtUtc { get; set; }

    public DateTime SentAtUtc { get; set; }
    public int Items { get; set; }
    public decimal Value { get; set; }
}

public sealed class ReminderResultDto
{
    public string UserId { get; set; } = string.Empty;

    /// <summary>sent · already_reminded · unsubscribed · no_address · cart_empty · failed.</summary>
    public string Status { get; set; } = string.Empty;

    public DateTime? SentAtUtc { get; set; }
}
