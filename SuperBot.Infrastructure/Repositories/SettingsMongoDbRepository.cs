using AutoMapper;
using Hangfire.Server;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;
using Telegram.Bot.Types;

namespace SuperBot.Infrastructure.Repositories
{
    public class SettingsMongoDbRepository : ISettingsRepository
    {
        private readonly IMongoCollection<SettingsDb> _settings;
        private readonly IMapper _mapper;

        public SettingsMongoDbRepository(IMongoDatabase database, IMapper mapper)
        {
            _mapper = mapper;
            _settings = database.GetCollection<SettingsDb>("Settings");
        }

        public async Task<IEnumerable<Settings>> GetAllAsync()
        {
            var ordersDb = await _settings.Find(_ => true).ToListAsync();
            return _mapper.Map<IEnumerable<Settings>>(ordersDb);
        }

        public async Task UpdateAsync(Settings updatedSettings)
        {
            var settingsDb = _mapper.Map<SettingsDb>(updatedSettings);
            await _settings.ReplaceOneAsync(s => s.Id == settingsDb.Id, settingsDb);
        }

        public async Task CreateAsync(Settings settings)
        {
            var settingsDb = _mapper.Map<SettingsDb>(settings);
            await _settings.InsertOneAsync(settingsDb);
        }
    }
}
