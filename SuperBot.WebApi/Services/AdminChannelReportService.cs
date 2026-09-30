using Microsoft.Extensions.Options;
using MongoDB.Driver;
using SuperBot.Core.Payments;
using SuperBot.Infrastructure.Data;
using SuperBot.Infrastructure.Services;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Откуда приходят покупатели и сколько на них зарабатывают.
///
/// Это тот разрез, который внешняя аналитика дать не может в принципе: Google знает источник
/// перехода, но не знает вашей закупочной цены. «Канал привёл выручку на тысячу» — половина
/// ответа; вторая половина в том, что после себестоимости от неё осталось.
///
/// Себестоимость берётся точно, а не долей: ключ теперь помнит заказ, по которому ушёл, — и
/// расход ложится ровно на ту продажу, которая его вызвала.
///
/// Источник — ПЕРВОЕ касание. Последнее почти всегда «прямой заход»: человек уже знает, куда
/// идёт, и приписывать заслугу ему значит хвалить закладку в браузере вместо рекламы.
/// </summary>
public sealed class AdminChannelReportService
{
    private static readonly string[] PaidStatuses = { "PAID", "PROCESSING", "AWAITING_KEYS", "DELIVERED" };
    private const string DirectLabel = "(direct)";

    private readonly IMongoDatabase _database;
    private readonly IFxRateService _fx;
    private readonly StorefrontCurrencyOptions _currencies;
    private readonly AdminChannelSpendService _spend;

    public AdminChannelReportService(IMongoDatabase database, IFxRateService fx, IOptions<StorefrontCurrencyOptions> currencies, AdminChannelSpendService spend)
    {
        _database = database;
        _fx = fx;
        _currencies = currencies.Value;
        _spend = spend;
    }

    public async Task<ChannelReportDto> BuildAsync(DateTime fromUtc, DateTime toUtc, CancellationToken ct = default)
    {
        var book = _fx.Current();
        var baseCurrency = _currencies.Base;

        decimal ToBase(string? currency, decimal amount)
        {
            if (string.IsNullOrWhiteSpace(currency) || currency.Equals(baseCurrency, StringComparison.OrdinalIgnoreCase))
            {
                return amount;
            }
            var rate = book.For(currency);
            return rate is null || rate.Rate <= 0 ? 0m : Math.Round(amount / rate.Rate, 2);
        }

        var orders = _database.GetCollection<OrderDb>("Orders");
        var keys = _database.GetCollection<GameKeyDb>("GameKeys");

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

        var paidOrders = await orders.Find(paidFilter)
            .Project(o => new
            {
                Id = o.Id.ToString(),
                o.UserId,
                o.Currency,
                Total = o.Totals.Total,
                o.TotalAmount,
                o.Items,
                o.Attribution,
                o.PaidAt,
                o.OrderDate
            })
            .ToListAsync(ct);

        // Себестоимость по заказам периода — одним запросом, чтобы не ходить в базу за каждым.
        var orderIds = paidOrders.Select(o => o.Id).ToList();
        var soldKeys = orderIds.Count == 0
            ? new List<(string OrderId, decimal? UnitCost, string CostCurrency)>()
            : (await keys
                .Find(Builders<GameKeyDb>.Filter.In(k => k.OrderId, orderIds))
                .Project(k => new { k.OrderId, k.UnitCost, k.CostCurrency })
                .ToListAsync(ct))
                .Select(k => (k.OrderId, k.UnitCost, k.CostCurrency))
                .ToList();

        var costByOrder = new Dictionary<string, (decimal Cost, int Keys, int WithoutCost)>(StringComparer.OrdinalIgnoreCase);
        foreach (var key in soldKeys)
        {
            costByOrder.TryGetValue(key.OrderId, out var current);
            var cost = current.Cost + (key.UnitCost.HasValue ? ToBase(key.CostCurrency, key.UnitCost.Value) : 0m);
            costByOrder[key.OrderId] = (cost, current.Keys + 1, current.WithoutCost + (key.UnitCost.HasValue ? 0 : 1));
        }

        var rows = new Dictionary<string, ChannelRowDto>(StringComparer.OrdinalIgnoreCase);
        foreach (var order in paidOrders)
        {
            // Пусто — прямой заход: человек пришёл сам, и это тоже канал, просто бесплатный.
            var source = string.IsNullOrWhiteSpace(order.Attribution?.Source) ? DirectLabel : order.Attribution.Source!;
            if (!rows.TryGetValue(source, out var row))
            {
                row = new ChannelRowDto { Source = source };
                rows[source] = row;
            }

            row.Orders += 1;
            row.UnitsSold += (order.Items ?? new List<OrderItemSnapshotDb>()).Sum(i => i.Quantity);
            row.Revenue += ToBase(order.Currency, order.Total != 0 ? order.Total : order.TotalAmount ?? 0);
            if (costByOrder.TryGetValue(order.Id, out var cost))
            {
                row.Cost += cost.Cost;
                row.KeysIssued += cost.Keys;
                row.KeysWithoutCost += cost.WithoutCost;
            }
            else
            {
                // Заказ есть, а выданных по нему ключей нет: расход не зафиксирован нигде.
                row.OrdersWithoutKeys += 1;
            }

            if (!string.IsNullOrWhiteSpace(order.Attribution?.Campaign))
            {
                row.Campaigns.Add(order.Attribution.Campaign!);
            }
        }

        // ---- повторные покупки ----
        // Считаем по всей истории, а не только за период: «второй раз» — это про человека,
        // а не про отрезок времени. Покупатель, вернувшийся через полгода, всё равно повторный.
        var allBuyers = await orders
            .Find(Builders<OrderDb>.Filter.In(o => o.Status, PaidStatuses))
            .Project(o => new { o.UserId, o.PaidAt, o.OrderDate })
            .ToListAsync(ct);

        var ordersByBuyer = allBuyers
            .Where(o => !string.IsNullOrWhiteSpace(o.UserId))
            .GroupBy(o => o.UserId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.Count(), StringComparer.OrdinalIgnoreCase);

        var buyersInPeriod = paidOrders
            .Where(o => !string.IsNullOrWhiteSpace(o.UserId))
            .Select(o => o.UserId)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var repeatBuyers = buyersInPeriod.Count(buyer => ordersByBuyer.TryGetValue(buyer, out var count) && count > 1);

        // Траты заносит человек, поэтому их может не быть вовсе — тогда окупаемость просто
        // не показывается, а не считается нулевой.
        var spendBySource = await _spend.SpendBySourceAsync(fromUtc, toUtc, ct);
        foreach (var pair in spendBySource)
        {
            if (!rows.TryGetValue(pair.Key, out var row))
            {
                // Потратили, а продаж нет — такую строку тем более надо показать.
                row = new ChannelRowDto { Source = pair.Key };
                rows[pair.Key] = row;
            }
            row.Spend = pair.Value;
        }

        var ordered = rows.Values.OrderByDescending(r => r.GrossProfit).ThenByDescending(r => r.Revenue).ToList();

        return new ChannelReportDto
        {
            FromUtc = fromUtc,
            ToUtc = toUtc,
            BaseCurrency = baseCurrency,
            Rows = ordered,
            Repeat = new RepeatCustomersDto
            {
                BuyersInPeriod = buyersInPeriod.Count,
                RepeatBuyers = repeatBuyers,
                RepeatSharePercent = buyersInPeriod.Count == 0
                    ? null
                    : Math.Round(repeatBuyers * 100m / buyersInPeriod.Count, 1)
            },
            Totals = new ChannelTotalsDto
            {
                Revenue = ordered.Sum(r => r.Revenue),
                Cost = ordered.Sum(r => r.Cost),
                GrossProfit = ordered.Sum(r => r.GrossProfit),
                Orders = ordered.Sum(r => r.Orders),
                OrdersWithoutKeys = ordered.Sum(r => r.OrdersWithoutKeys),
                KeysWithoutCost = ordered.Sum(r => r.KeysWithoutCost),
                UnattributedOrders = ordered.FirstOrDefault(r => r.Source == DirectLabel)?.Orders ?? 0,
                Spend = ordered.Sum(r => r.Spend ?? 0m),
                SourcesWithSpend = ordered.Count(r => r.Spend.HasValue)
            }
        };
    }
}

public sealed class ChannelRowDto
{
    public string Source { get; set; } = string.Empty;
    public int Orders { get; set; }
    public decimal Revenue { get; set; }
    public decimal Cost { get; set; }
    public int UnitsSold { get; set; }
    public int KeysIssued { get; set; }
    public int KeysWithoutCost { get; set; }

    /// <summary>Заказы, по которым ключи не выдавались: их расход неизвестен.</summary>
    public int OrdersWithoutKeys { get; set; }

    public HashSet<string> Campaigns { get; set; } = new(StringComparer.OrdinalIgnoreCase);

    public decimal GrossProfit => Revenue - Cost;

    public decimal? MarginPercent => Revenue == 0 ? null : Math.Round(GrossProfit / Revenue * 100m, 1);

    public decimal? AverageOrder => Orders == 0 ? null : Math.Round(Revenue / Orders, 2);

    /// <summary>Потрачено на канал за период. null — трат не заносили, а не «потратили ноль».</summary>
    public decimal? Spend { get; set; }

    /// <summary>
    /// Заработано после вычета трат. null, пока траты не занесены: показать здесь всю маржу
    /// значило бы выдать нерекламный канал за окупившийся.
    /// </summary>
    public decimal? NetProfit => Spend.HasValue ? GrossProfit - Spend.Value : null;

    /// <summary>Во сколько раз маржа превысила траты. Меньше 1 — канал в убытке.</summary>
    public decimal? Roas => Spend is null or 0 ? null : Math.Round(GrossProfit / Spend.Value, 2);

    /// <summary>
    /// Полон ли расход по каналу. Мало того, что у выданных ключей есть цена: выдано должно
    /// быть не меньше, чем продано штук. Заказ на две позиции с одним привязанным ключом даёт
    /// красивую маржу просто потому, что половина расхода не записана.
    /// </summary>
    public bool CostComplete => KeysWithoutCost == 0 && OrdersWithoutKeys == 0 && KeysIssued >= UnitsSold;
}

public sealed class RepeatCustomersDto
{
    public int BuyersInPeriod { get; set; }

    /// <summary>Из них тех, у кого это не первая покупка за всю историю.</summary>
    public int RepeatBuyers { get; set; }

    public decimal? RepeatSharePercent { get; set; }
}

public sealed class ChannelTotalsDto
{
    public decimal Revenue { get; set; }
    public decimal Cost { get; set; }
    public decimal GrossProfit { get; set; }
    public int Orders { get; set; }
    public int OrdersWithoutKeys { get; set; }
    public int KeysWithoutCost { get; set; }

    /// <summary>Заказы без источника — прямые заходы и всё, что пришло до появления атрибуции.</summary>
    public int UnattributedOrders { get; set; }

    public decimal Spend { get; set; }

    /// <summary>По скольким источникам траты вообще занесены.</summary>
    public int SourcesWithSpend { get; set; }
}

public sealed class ChannelReportDto
{
    public DateTime FromUtc { get; set; }
    public DateTime ToUtc { get; set; }
    public string BaseCurrency { get; set; } = "USD";
    public List<ChannelRowDto> Rows { get; set; } = new();
    public RepeatCustomersDto Repeat { get; set; } = new();
    public ChannelTotalsDto Totals { get; set; } = new();
}
