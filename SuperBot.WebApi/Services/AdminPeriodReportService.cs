using Microsoft.Extensions.Options;
using MongoDB.Driver;
using SuperBot.Core.Payments;
using SuperBot.Infrastructure.Data;
using SuperBot.Infrastructure.Services;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Отчёт за период: выручка, возвраты, себестоимость проданного и валовая прибыль.
///
/// Три принципа, от которых зависит, можно ли этим числам верить.
///
/// 1. <b>Дата — по событию, а не по заказу.</b> Выручка считается по дате оплаты, возврат — по
///    дате самого возврата. Заказ, оплаченный в июле и возвращённый в августе, попадёт в выручку
///    июля и в возвраты августа, а не пропадёт из обоих.
///
/// 2. <b>Себестоимость — по факту выдачи ключа.</b> Расход возникает, когда ключ ушёл покупателю,
///    а не когда партию залили: закупленный, но не проданный ключ — это склад, а не расход.
///
/// 3. <b>Неизвестное не выдаётся за ноль.</b> У ключей, заведённых до появления учёта закупок,
///    цены нет. Они считаются отдельно (<see cref="PeriodCostDto.KeysWithoutCost"/>), а не
///    приплюсовываются нулями — иначе прибыль оказалась бы завышенной и выглядела достоверной.
/// </summary>
public sealed class AdminPeriodReportService
{
    /// <summary>Статусы, при которых деньги считаются полученными. Тот же список, что у дашборда.</summary>
    private static readonly string[] PaidStatuses = { "PAID", "PROCESSING", "AWAITING_KEYS", "DELIVERED" };

    private const string RefundEventType = "refund";
    private const string StatusRefunded = "REFUNDED";

    private readonly IMongoDatabase _database;
    private readonly IFxRateService _fx;
    private readonly StorefrontCurrencyOptions _currencies;

    public AdminPeriodReportService(IMongoDatabase database, IFxRateService fx, IOptions<StorefrontCurrencyOptions> currencies)
    {
        _database = database;
        _fx = fx;
        _currencies = currencies.Value;
    }

    public async Task<PeriodReportDto> BuildAsync(DateTime fromUtc, DateTime toUtc, CancellationToken ct = default)
    {
        var book = _fx.Current();
        var baseCurrency = _currencies.Base;

        decimal ToBase(string? currency, decimal amount)
        {
            if (string.IsNullOrWhiteSpace(currency) || currency.Equals(baseCurrency, StringComparison.OrdinalIgnoreCase))
            {
                return amount;
            }
            // Книга хранит курсы «база → валюта»; для обратного перевода делим.
            var rate = book.For(currency);
            return rate is null || rate.Rate <= 0 ? 0m : Math.Round(amount / rate.Rate, 2);
        }

        var orders = _database.GetCollection<OrderDb>("Orders");
        var keys = _database.GetCollection<GameKeyDb>("GameKeys");

        // ---- выручка: заказы, оплаченные внутри периода ----
        // По PaidAt, а не по дате создания: заказ мог быть заведён вчера, а оплачен сегодня.
        // Там, где PaidAt почему-то не проставлен, откатываемся на дату заказа — потерять
        // оплаченный заказ в отчёте хуже, чем отнести его к чуть другому дню.
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
            .Project(o => new { o.Currency, Total = o.Totals.Total, o.TotalAmount, o.Items })
            .ToListAsync(ct);

        var revenue = paidOrders.Sum(o => ToBase(o.Currency, o.Total != 0 ? o.Total : o.TotalAmount ?? 0));
        // Штук продано — чтобы было с чем сравнить число выданных ключей. Без этой сверки отчёт
        // объявлял бы прибыль полной при нулевой себестоимости: ноль расходов выглядит отличным
        // результатом, хотя означает, что о них ничего не известно.
        var unitsSold = paidOrders.Sum(o => (o.Items ?? new List<OrderItemSnapshotDb>()).Sum(i => i.Quantity));

        // ---- возвраты: по дате события, а не по дате заказа ----
        var refundedOrders = await orders
            .Find(Builders<OrderDb>.Filter.ElemMatch(o => o.Events, e => e.Type == RefundEventType && e.CreatedAt >= fromUtc && e.CreatedAt < toUtc))
            .Project(o => new { o.Currency, Total = o.Totals.Total, o.TotalAmount, o.Status, o.RefundedAmount })
            .ToListAsync(ct);

        // Сумма возврата берётся из заказа. Её там не было до появления поля RefundedAmount,
        // поэтому для старых записей остаётся запасной путь: у полного возврата это вся сумма
        // заказа. У старого ЧАСТИЧНОГО возврата суммы нет нигде, кроме текста события, —
        // такие считаем штуками отдельно, а не подставляем догадку.
        decimal refundAmount = 0m;
        var refundedCount = 0;
        var unknownAmount = 0;
        foreach (var order in refundedOrders)
        {
            if (order.RefundedAmount is { } recorded)
            {
                refundAmount += ToBase(order.Currency, recorded);
                refundedCount++;
            }
            else if (string.Equals(order.Status, StatusRefunded, StringComparison.OrdinalIgnoreCase))
            {
                refundAmount += ToBase(order.Currency, order.Total != 0 ? order.Total : order.TotalAmount ?? 0);
                refundedCount++;
            }
            else
            {
                unknownAmount++;
            }
        }

        // ---- себестоимость: ключи, выданные внутри периода ----
        var soldKeys = await keys
            .Find(Builders<GameKeyDb>.Filter.And(
                Builders<GameKeyDb>.Filter.Ne(k => k.UserId, string.Empty),
                Builders<GameKeyDb>.Filter.Gte(k => k.IssuedAt, fromUtc),
                Builders<GameKeyDb>.Filter.Lt(k => k.IssuedAt, toUtc)))
            .Project(k => new { k.UnitCost, k.CostCurrency })
            .ToListAsync(ct);

        var withCost = soldKeys.Where(k => k.UnitCost.HasValue).ToList();
        var cost = withCost.Sum(k => ToBase(k.CostCurrency, k.UnitCost!.Value));

        return new PeriodReportDto
        {
            FromUtc = fromUtc,
            ToUtc = toUtc,
            BaseCurrency = baseCurrency,
            Revenue = new PeriodRevenueDto { Amount = revenue, Orders = paidOrders.Count, UnitsSold = unitsSold },
            Refunds = new PeriodRefundsDto
            {
                Amount = refundAmount,
                Orders = refundedCount,
                WithoutAmount = unknownAmount
            },
            Cost = new PeriodCostDto
            {
                Amount = cost,
                KeysSold = soldKeys.Count,
                KeysWithCost = withCost.Count,
                KeysWithoutCost = soldKeys.Count - withCost.Count
            },
            GrossProfit = revenue - refundAmount - cost
        };
    }
}

public sealed class PeriodReportDto
{
    public DateTime FromUtc { get; set; }
    public DateTime ToUtc { get; set; }
    public string BaseCurrency { get; set; } = "USD";
    public PeriodRevenueDto Revenue { get; set; } = new();
    public PeriodRefundsDto Refunds { get; set; } = new();
    public PeriodCostDto Cost { get; set; } = new();

    /// <summary>Выручка − возвраты − себестоимость проданного.</summary>
    public decimal GrossProfit { get; set; }

    /// <summary>
    /// Можно ли верить прибыли как итогу.
    ///
    /// Мало того, что у выданных ключей должна быть цена, а у возвратов — сумма: выдано должно
    /// быть не меньше, чем продано штук. Иначе себестоимость нулевая просто потому, что о ней
    /// ничего не известно, и прибыль равна выручке — красиво и неправда. Ровно этот случай дают
    /// заказы, заведённые мимо конвейера выдачи ключей.
    /// </summary>
    public bool GrossProfitComplete =>
        Cost.KeysWithoutCost == 0 && Refunds.WithoutAmount == 0 && Cost.KeysSold >= Revenue.UnitsSold;
}

public sealed class PeriodRevenueDto
{
    public decimal Amount { get; set; }
    public int Orders { get; set; }

    /// <summary>Штук товара продано. Сравнивается с числом выданных ключей — см. GrossProfitComplete.</summary>
    public int UnitsSold { get; set; }
}

public sealed class PeriodRefundsDto
{
    public decimal Amount { get; set; }
    public int Orders { get; set; }

    /// <summary>
    /// Возвратов, у которых сумма нигде не записана, — только старые частичные, сделанные до
    /// появления поля. В деньги они не входят, поэтому показываются отдельной строкой.
    /// </summary>
    public int WithoutAmount { get; set; }
}

public sealed class PeriodCostDto
{
    public decimal Amount { get; set; }
    public int KeysSold { get; set; }
    public int KeysWithCost { get; set; }

    /// <summary>Продано ключей, у которых закупочная цена неизвестна. На эту величину расход занижен.</summary>
    public int KeysWithoutCost { get; set; }
}
