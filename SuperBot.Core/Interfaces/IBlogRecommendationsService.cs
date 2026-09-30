using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces
{
    public interface IBlogRecommendationsService
    {
        Task<BlogRecommendationsResult> GetHomeRecommendationsAsync(string userId, string anonId, int limit);
        Task<IReadOnlyList<BlogPost>> GetReadingHistoryAsync(string userId, int limit);
        Task TrackEventAsync(BlogEvent blogEvent);
        Task<IReadOnlyList<BlogEvent>> GetEventsByPostAsync(string postId, DateTime fromUtc);

        /// <summary>Сколько разных читателей совершили событие в каждой из статей — одним запросом.</summary>
        Task<Dictionary<string, int>> CountDistinctActorsByPostsAsync(
            IEnumerable<string> postIds,
            string eventType,
            DateTime fromUtc);
    }
}
