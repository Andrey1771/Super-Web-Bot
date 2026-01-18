using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class ViewedGameMongoDbRepository : IViewedGameRepository
    {
        private readonly IMongoCollection<ViewedGameDb> _viewedGames;

        public ViewedGameMongoDbRepository(IMongoDatabase database)
        {
            _viewedGames = database.GetCollection<ViewedGameDb>("ViewedGames");
        }

        public async Task<List<ViewedGame>> GetRecentAsync(string userId, int limit)
        {
            var items = await _viewedGames
                .Find(item => item.UserId == userId)
                .SortByDescending(item => item.LastViewedAt)
                .Limit(limit)
                .ToListAsync();

            return items
                .Select(item => new ViewedGame
                {
                    UserId = item.UserId,
                    GameId = item.GameId,
                    LastViewedAt = item.LastViewedAt,
                    ViewCount = item.ViewCount,
                    Source = item.Source
                })
                .ToList();
        }

        public async Task UpsertAsync(string userId, string gameId, string source = null)
        {
            var filter = Builders<ViewedGameDb>.Filter.Eq(item => item.UserId, userId) &
                         Builders<ViewedGameDb>.Filter.Eq(item => item.GameId, gameId);

            var update = Builders<ViewedGameDb>.Update
                .Set(item => item.LastViewedAt, DateTime.UtcNow)
                .Inc(item => item.ViewCount, 1)
                .SetOnInsert(item => item.UserId, userId)
                .SetOnInsert(item => item.GameId, gameId);

            if (!string.IsNullOrWhiteSpace(source))
            {
                update = update.Set(item => item.Source, source);
            }

            await _viewedGames.UpdateOneAsync(filter, update, new UpdateOptions { IsUpsert = true });
        }
    }
}
