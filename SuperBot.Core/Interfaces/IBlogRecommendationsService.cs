using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces
{
    public interface IBlogRecommendationsService
    {
        Task<BlogRecommendationsResult> GetHomeRecommendationsAsync(string userId, string anonId, int limit);
        Task<IReadOnlyList<BlogPost>> GetReadingHistoryAsync(string userId, int limit);
        Task TrackEventAsync(BlogEvent blogEvent);
    }
}
