using MongoDB.Driver;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Payments;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories;

public class FxRateMongoDbRepository : IFxRateRepository
{
    private readonly IMongoCollection<FxRateDb> _rates;

    public FxRateMongoDbRepository(IMongoDatabase database)
    {
        _rates = database.GetCollection<FxRateDb>("FxRates");
    }

    public async Task<IReadOnlyList<FxRate>> GetLatestAsync(string baseCurrency)
    {
        if (string.IsNullOrWhiteSpace(baseCurrency))
        {
            return Array.Empty<FxRate>();
        }

        var normalized = baseCurrency.Trim().ToUpperInvariant();

        // Снимков немного (валют единицы, импорт раз в сутки), поэтому берём все записи базы
        // и сворачиваем в памяти. Агрегация с $group ради десятков документов не окупается.
        var all = await _rates
            .Find(rate => rate.From == normalized)
            .SortByDescending(rate => rate.CapturedAtUtc)
            .ToListAsync();

        return all
            .GroupBy(rate => rate.To, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .Select(ToDomain)
            .ToList();
    }

    public async Task AddAsync(IEnumerable<FxRate> rates)
    {
        var documents = rates
            .Where(rate => rate.Rate > 0 && !string.IsNullOrWhiteSpace(rate.To))
            .Select(rate => new FxRateDb
            {
                From = rate.From.Trim().ToUpperInvariant(),
                To = rate.To.Trim().ToUpperInvariant(),
                Rate = rate.Rate,
                CapturedAtUtc = rate.CapturedAtUtc
            })
            .ToList();

        if (documents.Count == 0)
        {
            return;
        }

        await _rates.InsertManyAsync(documents);
    }

    public async Task<IReadOnlyList<FxRate>> GetHistoryAsync(string baseCurrency, string currency, int limit)
    {
        if (string.IsNullOrWhiteSpace(baseCurrency) || string.IsNullOrWhiteSpace(currency))
        {
            return Array.Empty<FxRate>();
        }

        var from = baseCurrency.Trim().ToUpperInvariant();
        var to = currency.Trim().ToUpperInvariant();

        var documents = await _rates
            .Find(rate => rate.From == from && rate.To == to)
            .SortByDescending(rate => rate.CapturedAtUtc)
            .Limit(Math.Clamp(limit, 1, 500))
            .ToListAsync();

        return documents.Select(ToDomain).ToList();
    }

    private static FxRate ToDomain(FxRateDb document) =>
        new(document.From, document.To, document.Rate, document.CapturedAtUtc);
}
