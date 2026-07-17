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

        // Именно Update, а не ReplaceOne: replace-upsert не запускает генератор _id,
        // и вторая вставленная скидка падала бы на дубликате _id: null.
        // При update-upsert сервер сам генерирует _id для нового документа.
        var update = Builders<GameDiscountDb>.Update
            .Set(existing => existing.GameId, discountDb.GameId)
            .Set(existing => existing.DiscountPercent, discountDb.DiscountPercent)
            .Set(existing => existing.StartDate, discountDb.StartDate)
            .Set(existing => existing.EndDate, discountDb.EndDate);

        await _discounts.UpdateOneAsync(
            existing => existing.GameId == discountDb.GameId,
            update,
            new UpdateOptions { IsUpsert = true });
    }

    public async Task DeleteByGameIdAsync(string gameId)
    {
        await _discounts.DeleteOneAsync(discount => discount.GameId == gameId);
    }
}
