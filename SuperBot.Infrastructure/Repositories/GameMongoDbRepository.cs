using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class GameMongoDbRepository : IGameRepository
    {
        private readonly IMongoCollection<GameDb> _games;

        public GameRepository(IMongoDatabase database)
        {
            _games = database.GetCollection<GameDb>("Games");
        }

        public async Task<List<Game>> GetAllAsync()
        {
            return await _games.Find(game => true).ToListAsync();
        }

        public async Task<Game> GetByIdAsync(string id)
        {
            return await _games.Find(game => game.Id == id).FirstOrDefaultAsync();
        }

        public async Task CreateAsync(Game game)
        {
            await _games.InsertOneAsync(game);
        }

        public async Task UpdateAsync(string id, Game updatedGame)
        {
            await _games.ReplaceOneAsync(game => game.Id == id, updatedGame);
        }

        public async Task DeleteAsync(string id)
        {
            await _games.DeleteOneAsync(game => game.Id == id);
        }
    }
}
