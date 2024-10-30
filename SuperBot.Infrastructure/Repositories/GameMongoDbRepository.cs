using AutoMapper;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class GameMongoDbRepository : IGameRepository
    {
        private readonly IMongoCollection<GameDb> _games;
        private readonly IMapper _mapper;

        public GameMongoDbRepository(IMongoDatabase database, IMapper mapper)
        {
            _mapper = mapper;
            _games = database.GetCollection<GameDb>("Games");
        }

        public async Task<List<Game>> GetAllAsync()
        {
            var gamesDb = await _games.Find(game => true).ToListAsync();
            if (gamesDb == null) {
                throw new Exception("Коллекция не найдена");
            }
                
            return _mapper.Map<List<Game>>(gamesDb);
        }

        public async Task<Game> GetByIdAsync(string id)
        {
            var gamesDb = await _games.Find(game => game.Id == id).ToListAsync();
            if (gamesDb == null)
            {
                throw new Exception("Коллекция не найдена");
            }
            return _mapper.Map<Game>(gamesDb.FirstOrDefault());
        }

        public async Task CreateAsync(Game game)
        {
            var gameDb = _mapper.Map<GameDb>(game);
            await _games.InsertOneAsync(gameDb);
        }

        public async Task UpdateAsync(string id, Game updatedGame)
        {
            var filter = new BsonDocument { { "Id", id } };
            var game = _mapper.Map<GameDb>(updatedGame);

            await _games.ReplaceOneAsync(filter, game);
        }

        public async Task DeleteAsync(string id)
        {
            await _games.DeleteOneAsync(game => game.Id == id);
        }
    }
}
