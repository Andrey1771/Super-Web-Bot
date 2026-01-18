using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class GameKeyMongoDbRepository : IGameKeyRepository
    {
        private readonly IMongoCollection<GameKeyDb> _gameKeys;

        public GameKeyMongoDbRepository(IMongoDatabase database)
        {
            _gameKeys = database.GetCollection<GameKeyDb>("GameKeys");
        }

        public async Task<List<GameKey>> GetByUserAsync(string userId, int limit)
        {
            var items = await _gameKeys
                .Find(key => key.UserId == userId)
                .SortByDescending(key => key.IssuedAt)
                .Limit(limit)
                .ToListAsync();

            return items
                .Select(item => new GameKey
                {
                    UserId = item.UserId,
                    GameId = item.GameId,
                    Key = item.Key,
                    KeyType = item.KeyType,
                    IssuedAt = item.IssuedAt,
                    IsActive = item.IsActive
                })
                .ToList();
        }

        public async Task AddAsync(GameKey gameKey)
        {
            var entity = new GameKeyDb
            {
                UserId = gameKey.UserId,
                GameId = gameKey.GameId,
                Key = gameKey.Key,
                KeyType = gameKey.KeyType,
                IssuedAt = gameKey.IssuedAt,
                IsActive = gameKey.IsActive
            };

            await _gameKeys.InsertOneAsync(entity);
        }
    }
}
