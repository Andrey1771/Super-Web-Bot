using Microsoft.Extensions.Options;
using MongoDB.Driver;
using SuperBot.Core.Payments;
using SuperBot.Infrastructure.Data;
using SuperBot.Infrastructure.Services;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Разбивка продаж по играм за период: сколько продано, выручка, себестоимость, маржа —
/// и отдельно те, что лежат без движения.
///
/// Отвечает на два разных вопроса, и второй не менее важен первого: «что приносит деньги»
/// и «во что вложились зря». Игра с полным складом и нулём продаж в отчёте по выручке просто
/// отсутствует — её не видно именно потому, что она ничего не заработала. Поэтому непроданные
/// перечисляются отдельным списком, а не выпадают из отчёта.
///
/// Названия берутся из снимка позиции заказа, а не из каталога: игру могли удалить, и тогда
/// строка отчёта за прошлый месяц осталась бы без имени. Каталог используется лишь чтобы
/// пометить, существует ли товар сейчас, — снимок для того в заказе и лежит.
/// </summary>
public sealed class AdminGameSalesReportService
{
    private static readonly string[] PaidStatuses = { "PAID", "PROCESSING", "AWAITING_KEYS", "DELIVERED" };
    private const string RefundEventType = "refund";
    private const string StatusRefunded = "REFUNDED";

    private readonly IMongoDatabase _database;
    private readonly IFxRateService _fx;
    private readonly StorefrontCurrencyOptions _currencies;

    public AdminGameSalesReportService(IMongoDatabase database, IFxRateService fx, IOptions<StorefrontCurrencyOptions> currencies)
    {
        _database = database;
        _fx = fx;
        _currencies = currencies.Value;
    }

    public async Task<GameSalesReportDto> BuildAsync(DateTime fromUtc, DateTime toUtc, CancellationToken ct = default)
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
        var games = _database.GetCollection<GameDb>("Games");

        var rows = new Dictionary<string, GameSalesRowDto>(StringComparer.OrdinalIgnoreCase);

        GameSalesRowDto Row(string gameId, string? snapshotTitle)
        {
            if (!rows.TryGetValue(gameId, out var row))
            {
                row = new GameSalesRowDto { GameId = gameId, Title = snapshotTitle ?? gameId };
                rows[gameId] = row;
            }
            // Название из более позднего заказа точнее: игру могли переименовать.
            else if (!string.IsNullOrWhiteSpace(snapshotTitle))
            {
                row.Title = snapshotTitle!;
            }
            return row;
        }

        // ---- продажи: позиции оплаченных заказов периода ----
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

        // Проекция только нужного: за год заказов может быть много, а из каждого нужны три поля.
        var paidOrders = await orders.Find(paidFilter)
            .Project(o => new { o.Currency, o.Items })
            .ToListAsync(ct);

        foreach (var order in paidOrders)
        {
            foreach (var item in order.Items ?? new List<OrderItemSnapshotDb>())
            {
                if (string.IsNullOrWhiteSpace(item.GameId))
                {
                    continue;
                }
                var row = Row(item.GameId!, item.Title);
                row.UnitsSold += item.Quantity;
                row.Revenue += ToBase(order.Currency, item.LineTotal);
            }
        }

        // ---- возвраты: только полные, по дате события ----
        // Сумма частичного возврата теперь известна (RefundedAmount), но разложить её по
        // позициям заказа нечем: какая именно позиция возвращена, нигде не записано. Поэтому
        // здесь по-прежнему только полные возвраты — у них возвращены все позиции целиком.
        // Общая сумма частичных видна в отчёте за период.
        var refunded = await orders
            .Find(Builders<OrderDb>.Filter.And(
                Builders<OrderDb>.Filter.Eq(o => o.Status, StatusRefunded),
                Builders<OrderDb>.Filter.ElemMatch(o => o.Events, e => e.Type == RefundEventType && e.CreatedAt >= fromUtc && e.CreatedAt < toUtc)))
            .Project(o => new { o.Currency, o.Items })
            .ToListAsync(ct);

        foreach (var order in refunded)
        {
            foreach (var item in order.Items ?? new List<OrderItemSnapshotDb>())
            {
                if (string.IsNullOrWhiteSpace(item.GameId))
                {
                    continue;
                }
                var row = Row(item.GameId!, item.Title);
                row.RefundedUnits += item.Quantity;
                row.Refunded += ToBase(order.Currency, item.LineTotal);
            }
        }

        // ---- себестоимость: ключи, выданные в периоде ----
        var soldKeys = await keys
            .Find(Builders<GameKeyDb>.Filter.And(
                Builders<GameKeyDb>.Filter.Ne(k => k.UserId, string.Empty),
                Builders<GameKeyDb>.Filter.Gte(k => k.IssuedAt, fromUtc),
                Builders<GameKeyDb>.Filter.Lt(k => k.IssuedAt, toUtc)))
            .Project(k => new { k.GameId, k.UnitCost, k.CostCurrency })
            .ToListAsync(ct);

        foreach (var key in soldKeys)
        {
            if (string.IsNullOrWhiteSpace(key.GameId))
            {
                continue;
            }
            var row = Row(key.GameId, null);
            row.KeysIssued += 1;
            if (key.UnitCost.HasValue)
            {
                row.Cost += ToBase(key.CostCurrency, key.UnitCost.Value);
            }
            else
            {
                row.KeysWithoutCost += 1;
            }
        }

        // ---- имена и признак «есть ли ещё в каталоге» ----
        var catalog = await games.Find(Builders<GameDb>.Filter.Empty)
            .Project(g => new { g.Id, g.Title, g.Name })
            .ToListAsync(ct);
        var byId = catalog.ToDictionary(g => g.Id, g => string.IsNullOrWhiteSpace(g.Title) ? g.Name : g.Title, StringComparer.OrdinalIgnoreCase);

        foreach (var row in rows.Values)
        {
            if (byId.TryGetValue(row.GameId, out var title))
            {
                row.InCatalog = true;
                if (!string.IsNullOrWhiteSpace(title))
                {
                    row.Title = title;
                }
            }
        }

        // ---- что не продавалось: есть в каталоге, ключи в пуле, продаж ноль ----
        var poolByGame = await keys.Aggregate()
            .Match(Builders<GameKeyDb>.Filter.And(
                Builders<GameKeyDb>.Filter.Eq(k => k.UserId, string.Empty),
                Builders<GameKeyDb>.Filter.Eq(k => k.Voided, false)))
            .Group(k => k.GameId, g => new { GameId = g.Key, Available = g.Count() })
            .ToListAsync(ct);

        var unsold = poolByGame
            .Where(stat => !rows.ContainsKey(stat.GameId) && byId.ContainsKey(stat.GameId))
            .Select(stat => new UnsoldGameDto
            {
                GameId = stat.GameId,
                Title = byId[stat.GameId],
                KeysAvailable = stat.Available
            })
            .OrderByDescending(item => item.KeysAvailable)
            .ToList();

        var ordered = rows.Values.OrderByDescending(r => r.GrossProfit).ThenByDescending(r => r.Revenue).ToList();

        return new GameSalesReportDto
        {
            FromUtc = fromUtc,
            ToUtc = toUtc,
            BaseCurrency = baseCurrency,
            Rows = ordered,
            Unsold = unsold,
            Totals = new GameSalesTotalsDto
            {
                Revenue = ordered.Sum(r => r.Revenue),
                Refunded = ordered.Sum(r => r.Refunded),
                Cost = ordered.Sum(r => r.Cost),
                GrossProfit = ordered.Sum(r => r.GrossProfit),
                UnitsSold = ordered.Sum(r => r.UnitsSold),
                KeysIssued = ordered.Sum(r => r.KeysIssued),
                KeysWithoutCost = ordered.Sum(r => r.KeysWithoutCost),
                RowsWithUnknownCost = ordered.Count(r => !r.CostComplete),
                GamesSold = ordered.Count,
                GamesUnsold = unsold.Count
            }
        };
    }
}

public sealed class GameSalesRowDto
{
    public string GameId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;

    /// <summary>Есть ли игра в каталоге сейчас. False — продавалась, но с тех пор удалена.</summary>
    public bool InCatalog { get; set; }

    public int UnitsSold { get; set; }
    public decimal Revenue { get; set; }
    public int RefundedUnits { get; set; }
    public decimal Refunded { get; set; }
    public decimal Cost { get; set; }

    /// <summary>Выдано ключей этой игры за период (для сверки с проданными штуками).</summary>
    public int KeysIssued { get; set; }

    /// <summary>Из них без закупочной цены — на эту величину себестоимость занижена.</summary>
    public int KeysWithoutCost { get; set; }

    public decimal GrossProfit => Revenue - Refunded - Cost;

    /// <summary>
    /// Маржа в процентах от чистой выручки. null, когда выручки нет: делить не на что, а
    /// показать 0% значило бы сказать «продали без прибыли» вместо «не продавали».
    /// </summary>
    public decimal? MarginPercent =>
        Revenue - Refunded == 0 ? null : Math.Round(GrossProfit / (Revenue - Refunded) * 100m, 1);

    /// <summary>
    /// Можно ли верить марже как итогу.
    ///
    /// Мало того, что у выданных ключей должна быть цена — их должно быть выдано не меньше,
    /// чем продано штук. Иначе выходит «маржа 100%» просто потому, что о расходах ничего не
    /// известно: ноль себестоимости выглядит как отличный результат, хотя означает пустоту.
    /// Ровно этот случай и дают заказы, заведённые мимо конвейера выдачи ключей.
    /// </summary>
    public bool CostComplete => KeysWithoutCost == 0 && KeysIssued >= UnitsSold;
}

public sealed class UnsoldGameDto
{
    public string GameId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public int KeysAvailable { get; set; }
}

public sealed class GameSalesTotalsDto
{
    public decimal Revenue { get; set; }
    public decimal Refunded { get; set; }
    public decimal Cost { get; set; }
    public decimal GrossProfit { get; set; }
    public int UnitsSold { get; set; }
    public int KeysIssued { get; set; }
    public int KeysWithoutCost { get; set; }

    /// <summary>Сколько строк отчёта имеют неполную себестоимость: их маржа завышена.</summary>
    public int RowsWithUnknownCost { get; set; }

    public int GamesSold { get; set; }
    public int GamesUnsold { get; set; }
}

public sealed class GameSalesReportDto
{
    public DateTime FromUtc { get; set; }
    public DateTime ToUtc { get; set; }
    public string BaseCurrency { get; set; } = "USD";
    public List<GameSalesRowDto> Rows { get; set; } = new();

    /// <summary>Игры каталога с ключами в пуле, у которых за период нет ни одной продажи.</summary>
    public List<UnsoldGameDto> Unsold { get; set; } = new();

    public GameSalesTotalsDto Totals { get; set; } = new();
}
