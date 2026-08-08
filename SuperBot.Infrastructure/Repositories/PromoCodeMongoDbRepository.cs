using AutoMapper;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories;

public class PromoCodeMongoDbRepository : IPromoCodeRepository
{
    private readonly IMongoCollection<PromoCodeDb> _collection;
    private readonly IMapper _mapper;

    public PromoCodeMongoDbRepository(IMongoDatabase database, IMapper mapper)
    {
        _collection = database.GetCollection<PromoCodeDb>("PromoCodes");
        _mapper = mapper;
    }

    public async Task<List<PromoCode>> GetAllAsync()
    {
        var items = await _collection.Find(_ => true).SortByDescending(p => p.CreatedAt).ToListAsync();
        return _mapper.Map<List<PromoCode>>(items);
    }

    public async Task<PromoCode?> GetByIdAsync(string id)
    {
        if (!ObjectId.TryParse(id, out _))
        {
            return null;
        }

        var item = await _collection.Find(p => p.Id == id).FirstOrDefaultAsync();
        return _mapper.Map<PromoCode?>(item);
    }

    public async Task<PromoCode?> GetByCodeAsync(string code)
    {
        var normalizedCode = code.Trim().ToUpperInvariant();
        var item = await _collection.Find(p => p.Code == normalizedCode).FirstOrDefaultAsync();
        return _mapper.Map<PromoCode?>(item);
    }

    public async Task<long> DeleteExpiredByPrefixAsync(string codePrefix, DateTime expiredBeforeUtc)
    {
        if (string.IsNullOrWhiteSpace(codePrefix))
        {
            return 0;
        }

        // ^PREFIX — якорь в начале, чтобы не задеть коды, где префикс встречается в середине.
        var prefixFilter = Builders<PromoCodeDb>.Filter.Regex(
            item => item.Code,
            new BsonRegularExpression($"^{System.Text.RegularExpressions.Regex.Escape(codePrefix)}"));

        var filter = Builders<PromoCodeDb>.Filter.And(
            prefixFilter,
            Builders<PromoCodeDb>.Filter.Lt(item => item.EndDate, expiredBeforeUtc));

        var result = await _collection.DeleteManyAsync(filter);
        return result.DeletedCount;
    }

    public async Task<PromoCode> CreateAsync(PromoCode promoCode)
    {
        promoCode.Code = promoCode.Code.Trim().ToUpperInvariant();
        var exists = await GetByCodeAsync(promoCode.Code);
        if (exists != null)
        {
            throw new InvalidOperationException("Promo code already exists.");
        }

        var db = _mapper.Map<PromoCodeDb>(promoCode);
        db.Id = null;
        db.CreatedAt = promoCode.CreatedAt == default ? DateTime.UtcNow : promoCode.CreatedAt;

        await _collection.InsertOneAsync(db);
        return _mapper.Map<PromoCode>(db);
    }

    public async Task UpdateAsync(PromoCode promoCode)
    {
        if (string.IsNullOrWhiteSpace(promoCode.Id))
        {
            throw new InvalidOperationException("Promo code id is required.");
        }

        promoCode.Code = promoCode.Code.Trim().ToUpperInvariant();
        var existingByCode = await GetByCodeAsync(promoCode.Code);
        if (existingByCode != null && !string.Equals(existingByCode.Id, promoCode.Id, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Promo code already exists.");
        }

        var db = _mapper.Map<PromoCodeDb>(promoCode);
        await _collection.ReplaceOneAsync(p => p.Id == db.Id, db);
    }

    public async Task DeleteAsync(string id)
    {
        await _collection.DeleteOneAsync(p => p.Id == id);
    }
}
