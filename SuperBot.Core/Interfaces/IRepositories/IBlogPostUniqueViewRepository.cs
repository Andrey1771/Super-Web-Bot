using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public class BlogUniqueViewCounters
    {
        public int PublicUniqueViews { get; set; }
        public int AuthenticatedUniqueViews { get; set; }
        public int GuestUniqueViewsTotal { get; set; }
        public int GuestUniqueViewsCounted { get; set; }
        public int GuestUniqueViewsExcluded { get; set; }
    }

    public interface IBlogPostUniqueViewRepository
    {
        Task<BlogPostUniqueView> GetByPostAndViewerKeyAsync(string postId, string viewerKey);
        Task CreateAsync(BlogPostUniqueView uniqueView);
        Task TouchAsync(string id, DateTime viewedAt, string sessionId, string userAgentHash, string ipHash);
        Task<Dictionary<string, int>> CountPublicViewsByPostIdsAsync(IEnumerable<string> postIds);
        Task<int> CountPublicViewsByPostIdAsync(string postId);
        Task<Dictionary<string, int>> GetGuestViewCountsAsync(IEnumerable<string> postIds);
        Task<BlogUniqueViewCounters> GetCountersByPostIdAsync(string postId);
        Task<Dictionary<string, BlogUniqueViewCounters>> GetCountersByPostIdsAsync(IEnumerable<string> postIds);
        Task<List<(DateTime BucketStart, int Count)>> GetPublicViewTimelineByPostIdAsync(string postId);
        Task<IReadOnlyList<BlogPostUniqueView>> GetLatestViewsByPostIdAsync(string postId, int limit);
        Task<long> ExcludeGuestViewsAsync();
        Task<long> DeleteGuestViewsAsync();
        Task<BlogUniqueViewCounters> GetGlobalCountersAsync();
    }
}
