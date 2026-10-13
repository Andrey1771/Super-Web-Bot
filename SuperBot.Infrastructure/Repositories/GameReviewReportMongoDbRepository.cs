using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class GameReviewReportMongoDbRepository : IGameReviewReportRepository
    {
        private readonly IMongoCollection<GameReviewReportDb> _reports;

        public GameReviewReportMongoDbRepository(IMongoDatabase database)
        {
            _reports = database.GetCollection<GameReviewReportDb>("GameReviewReports");
        }

        public async Task<bool> AddAsync(GameReviewReport report)
        {
            var already = Builders<GameReviewReportDb>.Filter.Eq(item => item.ReviewId, report.ReviewId) &
                          Builders<GameReviewReportDb>.Filter.Eq(item => item.UserId, report.UserId);
            if (await _reports.Find(already).AnyAsync())
            {
                return false;
            }

            await _reports.InsertOneAsync(new GameReviewReportDb
            {
                ReviewId = report.ReviewId,
                UserId = report.UserId,
                UserName = report.UserName,
                Reason = report.Reason.ToString(),
                Comment = string.IsNullOrWhiteSpace(report.Comment) ? null : report.Comment.Trim(),
                CreatedAt = report.CreatedAt
            });
            return true;
        }

        public async Task<int> CountReportersAsync(string reviewId)
        {
            var filter = Builders<GameReviewReportDb>.Filter.Eq(item => item.ReviewId, reviewId);
            var users = await _reports.Distinct(item => item.UserId, filter).ToListAsync();
            return users.Count;
        }

        public async Task<IReadOnlyList<GameReviewReport>> ForReviewsAsync(IEnumerable<string> reviewIds)
        {
            var ids = reviewIds.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct().ToList();
            if (ids.Count == 0)
            {
                return Array.Empty<GameReviewReport>();
            }
            var items = await _reports
                .Find(Builders<GameReviewReportDb>.Filter.In(item => item.ReviewId, ids))
                .SortByDescending(item => item.CreatedAt)
                .ToListAsync();
            return items.Select(item => new GameReviewReport
            {
                Id = item.Id,
                ReviewId = item.ReviewId,
                UserId = item.UserId,
                UserName = item.UserName,
                Reason = Enum.TryParse<ReviewReportReason>(item.Reason, true, out var reason) ? reason : ReviewReportReason.Other,
                Comment = item.Comment,
                CreatedAt = item.CreatedAt
            }).ToList();
        }
    }
}
