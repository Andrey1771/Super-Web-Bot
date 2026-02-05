using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public class GameReviewQuery
    {
        public string GameId { get; set; }
        public string Sort { get; set; } = "createdAt:desc";
        public int? Rating { get; set; }
        public bool? WithPlaytime { get; set; }
        public bool? WithImages { get; set; }
        public string Search { get; set; }
        public int Page { get; set; } = 1;
        public int PageSize { get; set; } = 10;
    }

    public class GameReviewSummary
    {
        public double Average { get; set; }
        public int Count { get; set; }
        public Dictionary<int, int> Distribution { get; set; } = new();
    }

    public interface IGameReviewRepository
    {
        Task<(IReadOnlyList<GameReview> Items, long Total)> GetPagedAsync(GameReviewQuery query);
        Task<GameReviewSummary> GetSummaryAsync(string gameId);
        Task<GameReview> GetByIdAsync(string reviewId);
        Task<GameReview> GetByUserAsync(string gameId, string userId);
        Task CreateAsync(GameReview review);
        Task UpdateAsync(string reviewId, GameReview review);
        Task UpdateHelpfulCountAsync(string reviewId, int helpfulCount);
    }
}
