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

            return items.Select(Map).ToList();
        }

        public async Task AddAsync(GameKey gameKey)
        {
            await _gameKeys.InsertOneAsync(ToDb(gameKey));
        }

        public async Task AddPoolKeysAsync(string gameId, string keyType, IEnumerable<string> keys)
        {
            var normalizedType = string.IsNullOrWhiteSpace(keyType) ? "CD Key" : keyType.Trim();
            var docs = keys
                .Where(k => !string.IsNullOrWhiteSpace(k))
                .Select(k => new GameKeyDb
                {
                    UserId = string.Empty, // не назначен — лежит в пуле
                    GameId = gameId,
                    Key = k.Trim(),
                    KeyType = normalizedType,
                    IssuedAt = default,
                    IsActive = false
                })
                .ToList();

            if (docs.Count > 0)
            {
                await _gameKeys.InsertManyAsync(docs);
            }
        }

        public Task<int> CountAvailableByGameAsync(string gameId) => CountAsync(gameId, assigned: false);

        public Task<int> CountAssignedByGameAsync(string gameId) => CountAsync(gameId, assigned: true);

        private async Task<int> CountAsync(string gameId, bool assigned)
        {
            var userFilter = assigned
                ? Builders<GameKeyDb>.Filter.Ne(k => k.UserId, string.Empty)
                : Builders<GameKeyDb>.Filter.Eq(k => k.UserId, string.Empty);
            var filter = Builders<GameKeyDb>.Filter.And(
                Builders<GameKeyDb>.Filter.Eq(k => k.GameId, gameId),
                userFilter);
            return (int)await _gameKeys.CountDocumentsAsync(filter);
        }

        public async Task<GameKey> TryDispensePoolKeyAsync(string gameId, string userId)
        {
            var filter = Builders<GameKeyDb>.Filter.And(
                Builders<GameKeyDb>.Filter.Eq(k => k.GameId, gameId),
                Builders<GameKeyDb>.Filter.Eq(k => k.UserId, string.Empty));
            var update = Builders<GameKeyDb>.Update
                .Set(k => k.UserId, userId)
                .Set(k => k.IssuedAt, DateTime.UtcNow)
                .Set(k => k.IsActive, true);
            var options = new FindOneAndUpdateOptions<GameKeyDb> { ReturnDocument = ReturnDocument.After };
            var updated = await _gameKeys.FindOneAndUpdateAsync(filter, update, options);
            return updated is null ? null : Map(updated);
        }

        private static GameKey Map(GameKeyDb item) => new GameKey
        {
            UserId = item.UserId,
            GameId = item.GameId,
            Key = item.Key,
            KeyType = item.KeyType,
            IssuedAt = item.IssuedAt,
            IsActive = item.IsActive
        };

        private static GameKeyDb ToDb(GameKey k) => new GameKeyDb
        {
            UserId = k.UserId,
            GameId = k.GameId,
            Key = k.Key,
            KeyType = k.KeyType,
            IssuedAt = k.IssuedAt,
            IsActive = k.IsActive
        };
    }
}
