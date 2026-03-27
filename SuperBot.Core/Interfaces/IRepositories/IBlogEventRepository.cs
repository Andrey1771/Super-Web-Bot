using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IBlogEventRepository
    {
        Task CreateAsync(BlogEvent blogEvent);
        Task<IReadOnlyList<BlogEvent>> GetRecentSinceAsync(DateTime fromUtc);
        Task<IReadOnlyList<BlogEvent>> GetRecentByPostAsync(string postId, DateTime fromUtc);
        Task<IReadOnlyList<BlogEvent>> GetRecentByUserAsync(string userId, int limit);
        Task<IReadOnlyList<BlogEvent>> GetRecentByAnonAsync(string anonId, int limit);
    }
}
