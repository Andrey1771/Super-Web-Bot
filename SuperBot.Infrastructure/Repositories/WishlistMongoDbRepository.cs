using MongoDB.Driver;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace SuperBot.Infrastructure.Repositories
{
    public class WishlistMongoDbRepository : IWishlistRepository
    {
        private readonly IMongoCollection<WishlistItemDb> _wishlistCollection;

        public WishlistMongoDbRepository(IMongoDatabase database)
        {
            _wishlistCollection = database.GetCollection<WishlistItemDb>("WishlistItems");
        }

        public async Task<HashSet<string>> GetGameIdsAsync(string userId)
        {
            var ids = await _wishlistCollection
                .Find(item => item.UserId == userId)
                .Project(item => item.GameId)
                .ToListAsync();

            return ids.ToHashSet();
        }

        public async Task AddAsync(string userId, string gameId)
        {
            if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(gameId))
            {
                return;
            }

            var filter = Builders<WishlistItemDb>.Filter.Eq(item => item.UserId, userId) &
                         Builders<WishlistItemDb>.Filter.Eq(item => item.GameId, gameId);
            var update = Builders<WishlistItemDb>.Update
                .SetOnInsert(item => item.UserId, userId)
                .SetOnInsert(item => item.GameId, gameId)
                .SetOnInsert(item => item.CreatedAt, DateTime.UtcNow);

            await _wishlistCollection.UpdateOneAsync(filter, update, new UpdateOptions { IsUpsert = true });
        }

        public async Task RemoveAsync(string userId, string gameId)
        {
            if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(gameId))
            {
                return;
            }

            var filter = Builders<WishlistItemDb>.Filter.Eq(item => item.UserId, userId) &
                         Builders<WishlistItemDb>.Filter.Eq(item => item.GameId, gameId);

            await _wishlistCollection.DeleteOneAsync(filter);
        }

        public async Task<HashSet<string>> MergeAsync(string userId, IEnumerable<string> guestIds)
        {
            var normalizedIds = guestIds?
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Select(id => id.Trim())
                .Distinct()
                .ToList() ?? new List<string>();

            if (normalizedIds.Count == 0)
            {
                return await GetGameIdsAsync(userId);
            }

            var writes = normalizedIds.Select(gameId =>
                new UpdateOneModel<WishlistItemDb>(
                    Builders<WishlistItemDb>.Filter.Eq(item => item.UserId, userId) &
                    Builders<WishlistItemDb>.Filter.Eq(item => item.GameId, gameId),
                    Builders<WishlistItemDb>.Update
                        .SetOnInsert(item => item.UserId, userId)
                        .SetOnInsert(item => item.GameId, gameId)
                        .SetOnInsert(item => item.CreatedAt, DateTime.UtcNow))
                { IsUpsert = true }
            ).ToList<WriteModel<WishlistItemDb>>();

            if (writes.Count > 0)
            {
                await _wishlistCollection.BulkWriteAsync(writes, new BulkWriteOptions { IsOrdered = false });
            }

            return await GetGameIdsAsync(userId);
        }
    }
}
