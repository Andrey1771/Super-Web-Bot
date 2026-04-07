using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IBlogPostUniqueViewRepository
    {
        Task<BlogPostUniqueView> GetByPostAndViewerKeyAsync(string postId, string viewerKey);
        Task CreateAsync(BlogPostUniqueView uniqueView);
        Task TouchAsync(string id, DateTime viewedAt, string sessionId, string userAgentHash, string ipHash);
        Task<Dictionary<string, int>> CountPublicViewsByPostIdsAsync(IEnumerable<string> postIds, bool includeGuestViews);
        Task<int> CountPublicViewsByPostIdAsync(string postId, bool includeGuestViews);
        Task<Dictionary<string, int>> GetGuestViewCountsAsync(IEnumerable<string> postIds);
        Task<long> ExcludeGuestViewsAsync();
        Task<long> DeleteGuestViewsAsync();
        Task<(int PublicUniqueViews, int AuthenticatedUniqueViews, int GuestUniqueViews)> GetGlobalCountersAsync(bool includeGuestViewsInPublicCounts);
    }
}
