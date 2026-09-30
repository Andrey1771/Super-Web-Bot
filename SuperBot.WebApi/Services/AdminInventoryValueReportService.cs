using Microsoft.Extensions.Options;
using MongoDB.Driver;
using SuperBot.Core.Payments;
using SuperBot.Infrastructure.Data;
using SuperBot.Infrastructure.Services;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Склад в деньгах: сколько ключей лежит непроданными и на какую сумму они закуплены.
///
/// Это снимок на «сейчас», а не за период: вопрос «сколько денег заморожено на складе» не
/// имеет смысла в прошедшем времени — важно, сколько лежит именно сегодня.
///
/// Считаются только ключи в пуле: выданный ключ — уже расход проданного, он попал в отчёт за
/// период. Изъятые ключи идут отдельной строкой как списание: закупочная цена при изъятии
/// сохраняется (стирается только само значение ключа), и эти деньги потеряны, а не заморожены.
///
/// Возраст запаса — по дате заведения партии. Ключ, лежащий полгода, стоит столько же, сколько
/// вчерашний, но означает совсем другое: деньги, вложенные в то, что не продаётся.
/// </summary>
public sealed class AdminInventoryValueReportService
{
    /// <summary>Границы «возраста» запаса в днях. Последняя корзина — всё, что старше.</summary>
    private static readonly int[] AgeBuckets = { 30, 90, 180 };

    private readonly IMongoDatabase _database;
    private readonly IFxRateService _fx;
    private readonly StorefrontCurrencyOptions _currencies;

    public AdminInventoryValueReportService(IMongoDatabase database, IFxRateService fx, IOptions<StorefrontCurrencyOptions> currencies)
    {
        _database = database;
        _fx = fx;
        _currencies = currencies.Value;
    }

    public async Task<InventoryValueReportDto> BuildAsync(CancellationToken ct = default)
    {
        var book = _fx.Current();
        var baseCurrency = _currencies.Base;
        var now = DateTime.UtcNow;

        decimal ToBase(string? currency, decimal amount)
        {
            if (string.IsNullOrWhiteSpace(currency) || currency.Equals(baseCurrency, StringComparison.OrdinalIgnoreCase))
            {
                return amount;
            }
            var rate = book.For(currency);
            return rate is null || rate.Rate <= 0 ? 0m : Math.Round(amount / rate.Rate, 2);
        }

        var keys = _database.GetCollection<GameKeyDb>("GameKeys");
        var games = _database.GetCollection<GameDb>("Games");

        // Пул: не выдан и не изъят.
        var pool = await keys
            .Find(Builders<GameKeyDb>.Filter.And(
                Builders<GameKeyDb>.Filter.Eq(k => k.UserId, string.Empty),
                Builders<GameKeyDb>.Filter.Ne(k => k.Voided, true)))
            .Project(k => new { k.GameId, k.UnitCost, k.CostCurrency, k.AcquiredAtUtc })
            .ToListAsync(ct);

        var rows = new Dictionary<string, InventoryRowDto>(StringComparer.OrdinalIgnoreCase);
        var buckets = BuildEmptyBuckets();

        foreach (var key in pool)
        {
            if (string.IsNullOrWhiteSpace(key.GameId))
            {
                continue;
            }

            if (!rows.TryGetValue(key.GameId, out var row))
            {
                row = new InventoryRowDto { GameId = key.GameId, Title = key.GameId };
                rows[key.GameId] = row;
            }

            row.KeysAvailable += 1;
            if (key.UnitCost.HasValue)
            {
                row.Value += ToBase(key.CostCurrency, key.UnitCost.Value);
            }
            else
            {
                row.KeysWithoutCost += 1;
            }

            if (key.AcquiredAtUtc.HasValue && (row.OldestAcquiredUtc is null || key.AcquiredAtUtc < row.OldestAcquiredUtc))
            {
                row.OldestAcquiredUtc = key.AcquiredAtUtc;
            }

            var bucket = BucketFor(key.AcquiredAtUtc, now, buckets);
            bucket.Keys += 1;
            if (key.UnitCost.HasValue)
            {
                bucket.Value += ToBase(key.CostCurrency, key.UnitCost.Value);
            }
        }

        // Изъятые — деньги потеряны. Отдельно, чтобы не путать со «заморожено».
        var voided = await keys
            .Find(Builders<GameKeyDb>.Filter.Eq(k => k.Voided, true))
            .Project(k => new { k.UnitCost, k.CostCurrency })
            .ToListAsync(ct);

        var writtenOffValue = voided.Where(k => k.UnitCost.HasValue).Sum(k => ToBase(k.CostCurrency, k.UnitCost!.Value));

        // Названия и признак «есть ли ещё в каталоге».
        var catalog = await games.Find(Builders<GameDb>.Filter.Empty)
            .Project(g => new { g.Id, g.Title, g.Name })
            .ToListAsync(ct);
        var byId = catalog.ToDictionary(g => g.Id, g => string.IsNullOrWhiteSpace(g.Title) ? g.Name : g.Title, StringComparer.OrdinalIgnoreCase);

        foreach (var row in rows.Values)
        {
            if (byId.TryGetValue(row.GameId, out var title) && !string.IsNullOrWhiteSpace(title))
            {
                row.InCatalog = true;
                row.Title = title;
            }
            row.DaysOnShelf = row.OldestAcquiredUtc is null ? null : (int)Math.Floor((now - row.OldestAcquiredUtc.Value).TotalDays);
        }

        // Сортировка по деньгам: сверху то, где заморожено больше всего. Игры без известной
        // закупочной цены имеют нулевую сумму и уходят вниз — поэтому вторым ключом идёт
        // количество, иначе они бы просто потерялись в хвосте.
        var ordered = rows.Values
            .OrderByDescending(r => r.Value)
            .ThenByDescending(r => r.KeysAvailable)
            .ToList();

        return new InventoryValueReportDto
        {
            GeneratedAtUtc = now,
            BaseCurrency = baseCurrency,
            Rows = ordered,
            Aging = buckets,
            Totals = new InventoryTotalsDto
            {
                KeysAvailable = ordered.Sum(r => r.KeysAvailable),
                Value = ordered.Sum(r => r.Value),
                KeysWithoutCost = ordered.Sum(r => r.KeysWithoutCost),
                Games = ordered.Count,
                WrittenOffKeys = voided.Count,
                WrittenOffValue = writtenOffValue
            }
        };
    }

    private static List<InventoryAgeBucketDto> BuildEmptyBuckets()
    {
        var list = new List<InventoryAgeBucketDto>();
        var previous = 0;
        foreach (var edge in AgeBuckets)
        {
            list.Add(new InventoryAgeBucketDto { Label = $"{previous}–{edge} days", MaxDays = edge });
            previous = edge;
        }
        list.Add(new InventoryAgeBucketDto { Label = $"{previous}+ days", MaxDays = null });
        // Ключи, залитые до появления учёта закупок, даты не имеют — им своя корзина, а не
        // «свежие»: иначе старый запас выглядел бы вчерашним.
        list.Add(new InventoryAgeBucketDto { Label = "Unknown", MaxDays = null, Unknown = true });
        return list;
    }

    private static InventoryAgeBucketDto BucketFor(DateTime? acquiredAt, DateTime now, List<InventoryAgeBucketDto> buckets)
    {
        if (acquiredAt is null)
        {
            return buckets.First(b => b.Unknown);
        }
        var days = (now - acquiredAt.Value).TotalDays;
        foreach (var bucket in buckets.Where(b => !b.Unknown && b.MaxDays.HasValue))
        {
            if (days <= bucket.MaxDays!.Value)
            {
                return bucket;
            }
        }
        return buckets.Last(b => !b.Unknown);
    }
}

public sealed class InventoryRowDto
{
    public string GameId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public bool InCatalog { get; set; }
    public int KeysAvailable { get; set; }

    /// <summary>Сумма закупки лежащих ключей в базовой валюте.</summary>
    public decimal Value { get; set; }

    /// <summary>Ключей без закупочной цены — на них оценка занижена.</summary>
    public int KeysWithoutCost { get; set; }

    public DateTime? OldestAcquiredUtc { get; set; }

    /// <summary>Сколько дней лежит самая старая партия. null — дата закупки неизвестна.</summary>
    public int? DaysOnShelf { get; set; }

    /// <summary>Вся ли позиция оценена. False — сумма ниже настоящей.</summary>
    public bool ValueComplete => KeysWithoutCost == 0;
}

public sealed class InventoryAgeBucketDto
{
    public string Label { get; set; } = string.Empty;
    public int? MaxDays { get; set; }
    public bool Unknown { get; set; }
    public int Keys { get; set; }
    public decimal Value { get; set; }
}

public sealed class InventoryTotalsDto
{
    public int KeysAvailable { get; set; }
    public decimal Value { get; set; }
    public int KeysWithoutCost { get; set; }
    public int Games { get; set; }
    public int WrittenOffKeys { get; set; }
    public decimal WrittenOffValue { get; set; }

    /// <summary>Оценена ли вся кладовая. False — настоящая сумма больше показанной.</summary>
    public bool ValueComplete => KeysWithoutCost == 0;
}

public sealed class InventoryValueReportDto
{
    public DateTime GeneratedAtUtc { get; set; }
    public string BaseCurrency { get; set; } = "USD";
    public List<InventoryRowDto> Rows { get; set; } = new();
    public List<InventoryAgeBucketDto> Aging { get; set; } = new();
    public InventoryTotalsDto Totals { get; set; } = new();
}
