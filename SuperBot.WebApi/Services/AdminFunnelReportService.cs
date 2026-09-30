using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Payments;
using SuperBot.Infrastructure.Data;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Воронка магазина: сколько людей дошло от просмотра игры до оплаты.
///
/// Считается по СВОИМ событиям, а не по Google. Причина простая: блокировщики рекламы у игровой
/// аудитории распространены как нигде, а отказ от куки выключает внешние счётчики полностью.
/// Внешняя аналитика хороша для вопроса «откуда пришли»; вопрос «где мы теряем деньги» должен
/// опираться на источник, который нельзя заблокировать.
///
/// Считаются ЛЮДИ, а не события: десять просмотров одним посетителем — это один человек,
/// дошедший до первого шага. Иначе воронка показывала бы не потери, а активность.
///
/// Последний шаг берётся из заказов, а не из событий: покупка уже записана в базе, и заводить
/// для неё второй, менее надёжный источник значило бы получить два разных числа выручки.
/// </summary>
public sealed class AdminFunnelReportService
{
    private static readonly string[] PaidStatuses = { "PAID", "PROCESSING", "AWAITING_KEYS", "DELIVERED" };

    private readonly IMongoDatabase _database;
    private readonly StorefrontCurrencyOptions _currencies;

    public AdminFunnelReportService(IMongoDatabase database, IOptions<StorefrontCurrencyOptions> currencies)
    {
        _database = database;
        _currencies = currencies.Value;
    }

    public async Task<FunnelReportDto> BuildAsync(DateTime fromUtc, DateTime toUtc, CancellationToken ct = default)
    {
        var events = _database.GetCollection<GameTrackingEventDb>("GameTrackingEvents");
        var orders = _database.GetCollection<OrderDb>("Orders");

        async Task<int> VisitorsAsync(string eventType)
        {
            var filter = Builders<GameTrackingEventDb>.Filter.And(
                Builders<GameTrackingEventDb>.Filter.Eq(e => e.EventType, eventType),
                Builders<GameTrackingEventDb>.Filter.Gte(e => e.Timestamp, fromUtc),
                Builders<GameTrackingEventDb>.Filter.Lt(e => e.Timestamp, toUtc));

            // Один посетитель — одна единица. Пользователь опознаётся по учётной записи, гость —
            // по анонимному идентификатору браузера; без обоих событие не считаем никем.
            var ids = await events.Aggregate()
                .Match(filter)
                .Group(new BsonDocument
                {
                    { "_id", new BsonDocument("$ifNull", new BsonArray { "$userId", "$anonId" }) }
                })
                .ToListAsync(ct);

            return ids.Count(doc => !doc["_id"].IsBsonNull && !string.IsNullOrWhiteSpace(doc["_id"].ToString()));
        }

        var viewed = await VisitorsAsync("game_view");
        var addedToCart = await VisitorsAsync("add_to_cart");
        var beganCheckout = await VisitorsAsync("begin_checkout");

        var paidFilter = Builders<OrderDb>.Filter.And(
            Builders<OrderDb>.Filter.In(o => o.Status, PaidStatuses),
            Builders<OrderDb>.Filter.Or(
                Builders<OrderDb>.Filter.And(
                    Builders<OrderDb>.Filter.Ne(o => o.PaidAt, null),
                    Builders<OrderDb>.Filter.Gte(o => o.PaidAt, fromUtc),
                    Builders<OrderDb>.Filter.Lt(o => o.PaidAt, toUtc)),
                Builders<OrderDb>.Filter.And(
                    Builders<OrderDb>.Filter.Eq(o => o.PaidAt, null),
                    Builders<OrderDb>.Filter.Gte(o => o.OrderDate, fromUtc),
                    Builders<OrderDb>.Filter.Lt(o => o.OrderDate, toUtc))));

        // Считаем покупателей теми же единицами, что и посетителей: по нашему идентификатору
        // посетителя, если он доехал до заказа. Тогда последний шаг — это те же люди, что и
        // первые три, и конверсию можно считать честно. Пока идентификатора нет ни у одного
        // заказа, откатываемся на учётную запись и говорим об этом флагом.
        var buyerDocs = await orders.Find(paidFilter)
            .Project(o => new { o.UserId, o.VisitorId })
            .ToListAsync(ct);

        var linkedBuyers = buyerDocs
            .Where(o => !string.IsNullOrWhiteSpace(o.VisitorId))
            .Select(o => o.VisitorId!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        // Связанным считаем только когда идентификатор есть у ВСЕХ заказов периода: иначе
        // часть покупателей выпала бы из счёта, а процент выглядел бы точным.
        var linked = buyerDocs.Count > 0 && linkedBuyers.Count > 0
            && buyerDocs.All(o => !string.IsNullOrWhiteSpace(o.VisitorId));

        var purchased = linked
            ? linkedBuyers.Count
            : buyerDocs.Where(o => !string.IsNullOrWhiteSpace(o.UserId))
                .Select(o => o.UserId)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Count();

        var steps = new List<FunnelStepDto>
        {
            new() { Key = "game_view", Label = "Viewed a game", Visitors = viewed },
            new() { Key = "add_to_cart", Label = "Added to cart", Visitors = addedToCart },
            new() { Key = "begin_checkout", Label = "Started checkout", Visitors = beganCheckout },
            new() { Key = "purchase", Label = "Paid", Visitors = purchased },
        };

        // Доли считаем от предыдущего шага и от вершины: первое отвечает «где именно теряем»,
        // второе — «сколько доходит вообще». Одного числа для этого не хватает.
        for (var i = 0; i < steps.Count; i++)
        {
            // У последнего шага людей считают по-другому — по заказам, а не по событиям
            // браузера. Делить одно на другое нельзя: получаются проценты вроде 244%, которые
            // выглядят точными и не значат ничего. Пока покупатель не связан с посетителем,
            // на этом шаге показываем только само число.
            var isUnlinkedPurchaseStep = steps[i].Key == "purchase" && !linked;
            if (isUnlinkedPurchaseStep)
            {
                steps[i].ShareOfTopPercent = null;
                steps[i].ShareOfPreviousPercent = null;
                steps[i].LostFromPrevious = 0;
                continue;
            }

            var top = steps[0].Visitors;
            var previous = i == 0 ? steps[0].Visitors : steps[i - 1].Visitors;
            steps[i].ShareOfTopPercent = top == 0 ? null : Math.Round(steps[i].Visitors * 100m / top, 1);
            steps[i].ShareOfPreviousPercent = previous == 0 ? null : Math.Round(steps[i].Visitors * 100m / previous, 1);
            steps[i].LostFromPrevious = i == 0 ? 0 : Math.Max(0, previous - steps[i].Visitors);
        }

        return new FunnelReportDto
        {
            FromUtc = fromUtc,
            ToUtc = toUtc,
            BaseCurrency = _currencies.Base,
            Steps = steps,
            // Пока покупатель не связан с посетителем, последний шаг — не тот же набор людей,
            // что первые три. Показать это надо явно: иначе процент выглядит точным, а он нет.
            BuyersLinkedToVisitors = linked
        };
    }
}

public sealed class FunnelStepDto
{
    public string Key { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;

    /// <summary>Сколько РАЗНЫХ людей дошло до шага.</summary>
    public int Visitors { get; set; }

    /// <summary>Доля от первого шага: сколько доходит вообще.</summary>
    public decimal? ShareOfTopPercent { get; set; }

    /// <summary>Доля от предыдущего шага: где именно теряем.</summary>
    public decimal? ShareOfPreviousPercent { get; set; }

    /// <summary>Сколько людей потеряно на переходе с предыдущего шага.</summary>
    public int LostFromPrevious { get; set; }
}

public sealed class FunnelReportDto
{
    public DateTime FromUtc { get; set; }
    public DateTime ToUtc { get; set; }
    public string BaseCurrency { get; set; } = "USD";
    public List<FunnelStepDto> Steps { get; set; } = new();

    /// <summary>
    /// Связан ли покупатель с посетителем. Пока false: первые три шага считаются по анонимному
    /// идентификатору браузера, а последний — по заказам. Проценты на последнем шаге поэтому
    /// приблизительные, и отчёт обязан об этом сказать.
    /// </summary>
    public bool BuyersLinkedToVisitors { get; set; }
}
