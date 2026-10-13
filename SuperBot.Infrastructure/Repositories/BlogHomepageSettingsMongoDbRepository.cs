using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class BlogHomepageSettingsMongoDbRepository : IBlogHomepageSettingsRepository
    {
        private const string SingletonId = "default";
        private readonly IMongoCollection<BlogHomepageSettingsDb> _settings;

        public BlogHomepageSettingsMongoDbRepository(IMongoDatabase database)
        {
            _settings = database.GetCollection<BlogHomepageSettingsDb>("BlogHomepageSettings");
        }

        public async Task<BlogHomepageSettings> GetAsync()
        {
            var db = await _settings.Find(item => item.Id == SingletonId).FirstOrDefaultAsync();
            if (db == null)
            {
                return null;
            }

            return new BlogHomepageSettings
            {
                Id = db.Id,
                MainHeroPostId = db.MainHeroPostId,
                UpdatedAt = db.UpdatedAt,
                UpdatedBy = db.UpdatedBy
            };
        }

        public async Task<BlogHomepageSettings> UpsertAsync(BlogHomepageSettings settings)
        {
            var db = new BlogHomepageSettingsDb
            {
                Id = SingletonId,
                MainHeroPostId = settings?.MainHeroPostId,
                UpdatedAt = settings?.UpdatedAt ?? DateTime.UtcNow,
                UpdatedBy = settings?.UpdatedBy
            };

            await _settings.ReplaceOneAsync(item => item.Id == SingletonId, db, new ReplaceOptions { IsUpsert = true });

            return new BlogHomepageSettings
            {
                Id = db.Id,
                MainHeroPostId = db.MainHeroPostId,
                UpdatedAt = db.UpdatedAt,
                UpdatedBy = db.UpdatedBy
            };
        }
    }
}
