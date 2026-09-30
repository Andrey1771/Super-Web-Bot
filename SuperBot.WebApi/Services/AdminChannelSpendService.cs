using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;
using SuperBot.Core.Payments;
using SuperBot.Infrastructure.Services;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Расходы на привлечение: сколько потрачено на канал и когда.
///
/// Без этих чисел отчёт по каналам отвечает только на половину вопроса. «Google принёс маржи
/// на двести долларов» — хорошо это или плохо, зависит от того, сколько за него заплатили.
/// Взять сумму неоткуда: рекламные кабинеты живут отдельно, и заносит её человек.
///
/// Одна запись — один расход за один день по одному источнику. Такой формы достаточно, чтобы
/// сложить траты за любой период, и она не заставляет заводить «кампании» там, где их нет.
/// </summary>
public sealed class AdminChannelSpendService
{
    private const string CollectionName = "ChannelSpend";

    private readonly IMongoDatabase _database;
    private readonly IFxRateService _fx;
    private readonly StorefrontCurrencyOptions _currencies;

    public AdminChannelSpendService(IMongoDatabase database, IFxRateService fx, IOptions<StorefrontCurrencyOptions> currencies)
    {
        _database = database;
        _fx = fx;
        _currencies = currencies.Value;
    }

    private IMongoCollection<ChannelSpendDb> Collection => _database.GetCollection<ChannelSpendDb>(CollectionName);

    /// <summary>Траты за период, приведённые к базовой валюте и сложенные по источникам.</summary>
    public async Task<Dictionary<string, decimal>> SpendBySourceAsync(DateTime fromUtc, DateTime toUtc, CancellationToken ct = default)
    {
        var book = _fx.Current();
        var baseCurrency = _currencies.Base;

        var rows = await Collection
            .Find(Builders<ChannelSpendDb>.Filter.And(
                Builders<ChannelSpendDb>.Filter.Gte(s => s.SpentOnUtc, fromUtc),
                Builders<ChannelSpendDb>.Filter.Lt(s => s.SpentOnUtc, toUtc)))
            .ToListAsync(ct);

        var result = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in rows)
        {
            var amount = row.Amount;
            if (!string.IsNullOrWhiteSpace(row.Currency)
                && !row.Currency.Equals(baseCurrency, StringComparison.OrdinalIgnoreCase))
            {
                var rate = book.For(row.Currency);
                amount = rate is null || rate.Rate <= 0 ? 0m : Math.Round(amount / rate.Rate, 2);
            }

            result.TryGetValue(row.Source, out var current);
            result[row.Source] = current + amount;
        }
        return result;
    }

    public async Task<IReadOnlyList<ChannelSpendDto>> ListAsync(DateTime fromUtc, DateTime toUtc, CancellationToken ct = default)
    {
        var rows = await Collection
            .Find(Builders<ChannelSpendDb>.Filter.And(
                Builders<ChannelSpendDb>.Filter.Gte(s => s.SpentOnUtc, fromUtc),
                Builders<ChannelSpendDb>.Filter.Lt(s => s.SpentOnUtc, toUtc)))
            .SortByDescending(s => s.SpentOnUtc)
            .ToListAsync(ct);

        return rows.Select(row => new ChannelSpendDto
        {
            Id = row.Id,
            Source = row.Source,
            SpentOnUtc = row.SpentOnUtc,
            Amount = row.Amount,
            Currency = row.Currency,
            Note = row.Note
        }).ToList();
    }

    public async Task<ChannelSpendDto> AddAsync(string source, DateTime spentOnUtc, decimal amount, string? currency, string? note, CancellationToken ct = default)
    {
        var row = new ChannelSpendDb
        {
            Id = ObjectId.GenerateNewId().ToString(),
            // Источник приводим к нижнему регистру: в отчёте «Google» и «google» должны быть
            // одной строкой, иначе бюджет разъедется по вариантам написания.
            Source = source.Trim().ToLowerInvariant(),
            SpentOnUtc = spentOnUtc.Date,
            Amount = amount,
            Currency = string.IsNullOrWhiteSpace(currency) ? _currencies.Base : currency.Trim().ToUpperInvariant(),
            Note = string.IsNullOrWhiteSpace(note) ? null : note.Trim()
        };

        await Collection.InsertOneAsync(row, cancellationToken: ct);
        return new ChannelSpendDto
        {
            Id = row.Id,
            Source = row.Source,
            SpentOnUtc = row.SpentOnUtc,
            Amount = row.Amount,
            Currency = row.Currency,
            Note = row.Note
        };
    }

    public async Task<bool> DeleteAsync(string id, CancellationToken ct = default)
    {
        var result = await Collection.DeleteOneAsync(s => s.Id == id, ct);
        return result.DeletedCount > 0;
    }
}

public class ChannelSpendDb
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = string.Empty;

    public string Source { get; set; } = string.Empty;

    /// <summary>День траты. Времени нет: рекламные кабинеты отчитываются по суткам.</summary>
    public DateTime SpentOnUtc { get; set; }

    public decimal Amount { get; set; }
    public string Currency { get; set; } = "USD";

    [BsonIgnoreIfNull]
    public string? Note { get; set; }
}

public sealed class ChannelSpendDto
{
    public string Id { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    public DateTime SpentOnUtc { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "USD";
    public string? Note { get; set; }
}
