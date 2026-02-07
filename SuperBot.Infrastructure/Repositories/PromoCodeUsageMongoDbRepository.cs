using AutoMapper;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories;

public class PromoCodeUsageMongoDbRepository : IPromoCodeUsageRepository
{
    private readonly IMongoCollection<PromoCodeUsageDb> _collection;
    private readonly IMapper _mapper;

    public PromoCodeUsageMongoDbRepository(IMongoDatabase database, IMapper mapper)
    {
        _collection = database.GetCollection<PromoCodeUsageDb>("PromoCodeUsages");
        _mapper = mapper;
    }

    public Task<long> CountByPromoCodeIdAsync(string promoCodeId)
    {
        return _collection.CountDocumentsAsync(u => u.PromoCodeId == promoCodeId);
    }

    public Task<long> CountByPromoCodeAndUserAsync(string promoCodeId, string userName)
    {
        return _collection.CountDocumentsAsync(u => u.PromoCodeId == promoCodeId && u.UserName == userName);
    }

    public Task RecordUsageAsync(PromoCodeUsage usage)
    {
        var db = _mapper.Map<PromoCodeUsageDb>(usage);
        return _collection.InsertOneAsync(db);
    }
}
