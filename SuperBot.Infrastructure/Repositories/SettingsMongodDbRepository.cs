using AutoMapper;
using MongoDB.Driver;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    class SettingsMongodDbRepository : ISettingsRepository
    {
        private readonly IMongoCollection<GameDb> _games;
        private readonly IMapper _mapper;

        public SettingsMongodDbRepository(IMongoDatabase database, IMapper mapper)
        {
            _mapper = mapper;
            _games = database.GetCollection<GameDb>("Games");
        }

        public async Task<List<Game>> GetAllAsync()
        {
            var gamesDb = await _games.Find(game => true).ToListAsync();
            if (gamesDb == null)
            {
                throw new Exception("Коллекция не найдена");
            }

            return _mapper.Map<List<Game>>(gamesDb);
        }
    }
}
