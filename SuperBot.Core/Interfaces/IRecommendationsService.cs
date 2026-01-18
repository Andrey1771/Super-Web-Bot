using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces
{
    public interface IRecommendationsService
    {
        Task<IReadOnlyList<RecommendationItem>> GetRecommendationsAsync(string userId, int limit);
    }
}
