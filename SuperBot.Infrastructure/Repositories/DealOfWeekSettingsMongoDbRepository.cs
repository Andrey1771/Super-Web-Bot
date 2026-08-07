using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class DealOfWeekSettingsMongoDbRepository : IDealOfWeekSettingsRepository
    {
        private const string SingletonId = "default";
        private readonly IMongoCollection<DealOfWeekSettingsDb> _settings;

        public DealOfWeekSettingsMongoDbRepository(IMongoDatabase database)
        {
            _settings = database.GetCollection<DealOfWeekSettingsDb>("DealOfWeekSettings");
        }

        public async Task<DealOfWeekSettings?> GetAsync()
        {
            var db = await _settings.Find(item => item.Id == SingletonId).FirstOrDefaultAsync();
            return db == null ? null : Map(db);
        }

        public async Task<DealOfWeekSettings> UpsertAsync(DealOfWeekSettings settings)
        {
            var db = new DealOfWeekSettingsDb
            {
                Id = SingletonId,
                HeroGameId = settings.HeroGameId,
                WingGameIds = settings.WingGameIds ?? new List<string>(),
                UpdatedAt = settings.UpdatedAt == default ? DateTime.UtcNow : settings.UpdatedAt
            };

            await _settings.ReplaceOneAsync(item => item.Id == SingletonId, db, new ReplaceOptions { IsUpsert = true });
            return Map(db);
        }

        private static DealOfWeekSettings Map(DealOfWeekSettingsDb db) => new()
        {
            Id = db.Id,
            HeroGameId = db.HeroGameId,
            WingGameIds = db.WingGameIds ?? new List<string>(),
            UpdatedAt = db.UpdatedAt
        };
    }
}
