using AutoMapper;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories;

public class GameDiscountMongoDbRepository : IGameDiscountRepository
{
    private readonly IMongoCollection<GameDiscountDb> _discounts;
    private readonly IMapper _mapper;

    public GameDiscountMongoDbRepository(IMongoDatabase database, IMapper mapper)
    {
        _mapper = mapper;
        _discounts = database.GetCollection<GameDiscountDb>("GameDiscounts");
    }

    public async Task<GameDiscount?> GetByGameIdAsync(string gameId)
    {
        if (string.IsNullOrWhiteSpace(gameId))
        {
            return null;
        }

        var discountDb = await _discounts.Find(discount => discount.GameId == gameId).FirstOrDefaultAsync();
        return _mapper.Map<GameDiscount?>(discountDb);
    }

    public async Task<List<GameDiscount>> GetByGameIdsAsync(IEnumerable<string> gameIds)
    {
        var ids = gameIds?.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct().ToList() ?? new List<string>();
        if (ids.Count == 0)
        {
            return new List<GameDiscount>();
        }

        var discountsDb = await _discounts.Find(discount => ids.Contains(discount.GameId)).ToListAsync();
        return _mapper.Map<List<GameDiscount>>(discountsDb);
    }

    public async Task UpsertAsync(GameDiscount discount)
    {
        var discountDb = _mapper.Map<GameDiscountDb>(discount);
        await _discounts.ReplaceOneAsync(
            existing => existing.GameId == discountDb.GameId,
            discountDb,
            new ReplaceOptions { IsUpsert = true });
    }

    public async Task DeleteByGameIdAsync(string gameId)
    {
        await _discounts.DeleteOneAsync(discount => discount.GameId == gameId);
    }
}
