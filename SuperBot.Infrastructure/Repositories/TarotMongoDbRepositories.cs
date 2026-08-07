using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class TarotSettingsMongoDbRepository : ITarotSettingsRepository
    {
        private const string SingletonId = "default";
        private readonly IMongoCollection<TarotSettingsDb> _settings;

        public TarotSettingsMongoDbRepository(IMongoDatabase database)
        {
            _settings = database.GetCollection<TarotSettingsDb>("TarotSettings");
        }

        public async Task<TarotSettings?> GetAsync()
        {
            var db = await _settings.Find(item => item.Id == SingletonId).FirstOrDefaultAsync();
            return db == null ? null : Map(db);
        }

        public async Task<TarotSettings> UpsertAsync(TarotSettings settings)
        {
            var db = new TarotSettingsDb
            {
                Id = SingletonId,
                Enabled = settings.Enabled,
                CooldownHours = settings.CooldownHours,
                CodeTtlHours = settings.CodeTtlHours,
                Tiers = (settings.Tiers ?? TarotSettings.DefaultTiers())
                    .Select(tier => new TarotLuckyTierDb { Percent = tier.Percent, Weight = tier.Weight })
                    .ToList(),
                UpdatedAt = settings.UpdatedAt == default ? DateTime.UtcNow : settings.UpdatedAt
            };

            await _settings.ReplaceOneAsync(item => item.Id == SingletonId, db, new ReplaceOptions { IsUpsert = true });
            return Map(db);
        }

        private static TarotSettings Map(TarotSettingsDb db) => new()
        {
            Id = db.Id,
            Enabled = db.Enabled,
            CooldownHours = db.CooldownHours,
            CodeTtlHours = db.CodeTtlHours,
            Tiers = db.Tiers is { Count: > 0 }
                ? db.Tiers.Select(tier => new TarotLuckyTier { Percent = tier.Percent, Weight = tier.Weight }).ToList()
                : TarotSettings.DefaultTiers(),
            UpdatedAt = db.UpdatedAt
        };
    }

    public class TarotDrawMongoDbRepository : ITarotDrawRepository
    {
        private readonly IMongoCollection<TarotDrawDb> _draws;

        public TarotDrawMongoDbRepository(IMongoDatabase database)
        {
            _draws = database.GetCollection<TarotDrawDb>("TarotDraws");
        }

        public async Task<TarotDraw?> GetLatestByUserAsync(string userId)
        {
            var db = await _draws
                .Find(item => item.UserId == userId)
                .SortByDescending(item => item.DrawnAt)
                .FirstOrDefaultAsync();
            return db == null ? null : Map(db);
        }

        public async Task<TarotDraw> CreateAsync(TarotDraw draw)
        {
            var db = new TarotDrawDb
            {
                UserId = draw.UserId,
                Code = draw.Code,
                PromoCodeId = draw.PromoCodeId,
                Percent = draw.Percent,
                DrawnAt = draw.DrawnAt,
                ExpiresAt = draw.ExpiresAt
            };
            await _draws.InsertOneAsync(db);
            return Map(db);
        }

        public Task<long> CountAsync() => _draws.CountDocumentsAsync(FilterDefinition<TarotDrawDb>.Empty);

        public Task<long> CountSinceAsync(DateTime sinceUtc) =>
            _draws.CountDocumentsAsync(item => item.DrawnAt >= sinceUtc);

        public async Task<List<TarotDraw>> GetRecentAsync(int limit)
        {
            var items = await _draws
                .Find(FilterDefinition<TarotDrawDb>.Empty)
                .SortByDescending(item => item.DrawnAt)
                .Limit(limit)
                .ToListAsync();
            return items.Select(Map).ToList();
        }

        private static TarotDraw Map(TarotDrawDb db) => new()
        {
            Id = db.Id,
            UserId = db.UserId,
            Code = db.Code,
            PromoCodeId = db.PromoCodeId,
            Percent = db.Percent,
            DrawnAt = db.DrawnAt,
            ExpiresAt = db.ExpiresAt
        };
    }
}
