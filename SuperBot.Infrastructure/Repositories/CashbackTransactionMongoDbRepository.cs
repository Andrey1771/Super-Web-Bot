using AutoMapper;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories;

public class CashbackTransactionMongoDbRepository : ICashbackTransactionRepository
{
    private readonly IMongoCollection<CashbackTransactionDb> _collection;
    private readonly IMapper _mapper;

    public CashbackTransactionMongoDbRepository(IMongoDatabase database, IMapper mapper)
    {
        _collection = database.GetCollection<CashbackTransactionDb>("CashbackTransactions");
        _mapper = mapper;
    }

    public async Task<bool> TryInsertAsync(CashbackTransaction transaction)
    {
        var db = _mapper.Map<CashbackTransactionDb>(transaction);
        db.Id = null;
        if (db.CreatedAt == default)
        {
            db.CreatedAt = DateTime.UtcNow;
        }

        try
        {
            await _collection.InsertOneAsync(db);
            transaction.Id = db.Id;
            return true;
        }
        catch (MongoWriteException ex) when (ex.WriteError?.Category == ServerErrorCategory.DuplicateKey)
        {
            // (OrderId, Type) уже есть — движение по этому заказу уже применено.
            return false;
        }
    }

    public async Task SetBalanceAfterAsync(string transactionId, decimal balanceAfter)
    {
        var update = Builders<CashbackTransactionDb>.Update.Set(item => item.BalanceAfter, balanceAfter);
        await _collection.UpdateOneAsync(item => item.Id == transactionId, update);
    }

    public async Task<IReadOnlyList<CashbackTransaction>> GetByUserAsync(string userId, int limit)
    {
        var items = await _collection
            .Find(item => item.UserId == userId)
            .SortByDescending(item => item.CreatedAt)
            .Limit(limit)
            .ToListAsync();

        return _mapper.Map<List<CashbackTransaction>>(items);
    }

    public async Task<CashbackTransaction?> GetByOrderAndTypeAsync(string orderId, CashbackTransactionType type)
    {
        var item = await _collection
            .Find(entry => entry.OrderId == orderId && entry.Type == type)
            .FirstOrDefaultAsync();

        return item is null ? null : _mapper.Map<CashbackTransaction>(item);
    }
}
