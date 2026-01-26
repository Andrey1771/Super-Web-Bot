using AutoMapper;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class AnalyticsSettingsMongoDbRepository : IAnalyticsSettingsRepository
    {
        private readonly IMongoCollection<AnalyticsSettingsDb> _settings;
        private readonly IMapper _mapper;

        public AnalyticsSettingsMongoDbRepository(IMongoDatabase database, IMapper mapper)
        {
            _mapper = mapper;
            _settings = database.GetCollection<AnalyticsSettingsDb>("AnalyticsSettings");
        }

        public async Task<AnalyticsSettings> GetAsync()
        {
            var settings = await _settings.Find(_ => true).FirstOrDefaultAsync();
            return _mapper.Map<AnalyticsSettings>(settings);
        }

        public async Task<AnalyticsSettings> UpsertAsync(AnalyticsSettings settings)
        {
            if (string.IsNullOrWhiteSpace(settings.Id))
            {
                settings.Id = ObjectId.GenerateNewId().ToString();
            }

            var db = _mapper.Map<AnalyticsSettingsDb>(settings);
            await _settings.ReplaceOneAsync(item => item.Id == db.Id, db, new ReplaceOptions { IsUpsert = true });
            return settings;
        }
    }
}
