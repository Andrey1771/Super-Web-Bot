using AutoMapper;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories;

public class CashbackAccountMongoDbRepository : ICashbackAccountRepository
{
    private readonly IMongoCollection<CashbackAccountDb> _collection;
    private readonly IMapper _mapper;

    public CashbackAccountMongoDbRepository(IMongoDatabase database, IMapper mapper)
    {
        _collection = database.GetCollection<CashbackAccountDb>("CashbackAccounts");
        _mapper = mapper;
    }

    public async Task<CashbackAccount?> GetByUserIdAsync(string userId)
    {
        var item = await _collection.Find(account => account.UserId == userId).FirstOrDefaultAsync();
        return item is null ? null : _mapper.Map<CashbackAccount>(item);
    }

    public async Task<CashbackAccount> IncrementAsync(string userId, decimal balanceDelta, decimal earnedDelta, decimal spentDelta)
    {
        var now = DateTime.UtcNow;
        // UserId на вставке приходит из фильтра-равенства — отдельный SetOnInsert не нужен.
        var update = Builders<CashbackAccountDb>.Update
            .Inc(account => account.Balance, balanceDelta)
            .Inc(account => account.LifetimeEarned, earnedDelta)
            .Inc(account => account.LifetimeSpent, spentDelta)
            .Set(account => account.UpdatedAt, now)
            .SetOnInsert(account => account.CreatedAt, now);

        var options = new FindOneAndUpdateOptions<CashbackAccountDb>
        {
            IsUpsert = true,
            ReturnDocument = ReturnDocument.After
        };

        var doc = await _collection.FindOneAndUpdateAsync(
            Builders<CashbackAccountDb>.Filter.Eq(account => account.UserId, userId), update, options);

        return _mapper.Map<CashbackAccount>(doc);
    }

    public async Task SetBalanceAsync(string userId, decimal balance)
    {
        var update = Builders<CashbackAccountDb>.Update
            .Set(account => account.Balance, balance)
            .Set(account => account.UpdatedAt, DateTime.UtcNow);

        await _collection.UpdateOneAsync(account => account.UserId == userId, update);
    }
}
