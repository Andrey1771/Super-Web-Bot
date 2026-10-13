using MongoDB.Driver;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class GameReviewHelpfulMongoDbRepository : IGameReviewHelpfulRepository
    {
        private readonly IMongoCollection<GameReviewHelpfulVoteDb> _votes;

        public GameReviewHelpfulMongoDbRepository(IMongoDatabase database)
        {
            _votes = database.GetCollection<GameReviewHelpfulVoteDb>("GameReviewHelpfulVotes");
        }

        public async Task<bool> ToggleAsync(string reviewId, string userId)
        {
            var filter = Builders<GameReviewHelpfulVoteDb>.Filter.Eq(item => item.ReviewId, reviewId) &
                         Builders<GameReviewHelpfulVoteDb>.Filter.Eq(item => item.UserId, userId);
            var existing = await _votes.Find(filter).FirstOrDefaultAsync();
            if (existing != null)
            {
                await _votes.DeleteOneAsync(filter);
                return false;
            }

            await _votes.InsertOneAsync(new GameReviewHelpfulVoteDb
            {
                ReviewId = reviewId,
                UserId = userId,
                CreatedAt = DateTime.UtcNow
            });

            return true;
        }
    }
}
