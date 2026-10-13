using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IBlogCommentRepository
    {
        Task CreateAsync(BlogComment comment);

        /// <summary>Видимые комментарии поста, новые первыми. Скрытые не попадают.</summary>
        Task<IReadOnlyList<BlogComment>> GetByPostAsync(string postId, int skip, int take);

        /// <summary>Количество видимых комментариев поста.</summary>
        Task<long> CountByPostAsync(string postId);

        /// <summary>Все комментарии для модерации (включая скрытые), новые первыми.
        /// status: null — все, иначе «Visible»/«Hidden».</summary>
        Task<IReadOnlyList<BlogComment>> GetPagedAsync(int skip, int take, string status = null);

        Task<long> CountAsync(string status = null);

        /// <summary>Сколько комментариев автор оставил после fromUtc — для rate-limit.</summary>
        Task<long> CountRecentByActorAsync(string userId, string anonId, DateTime fromUtc);

        Task<bool> SetStatusAsync(string id, string status);

        Task<bool> DeleteAsync(string id);

        Task<BlogComment> GetByIdAsync(string id);

        // --- Баны на комментирование ---

        Task<bool> IsAuthorBannedAsync(string userId);

        /// <summary>Какие из этих userId забанены — для флагов в админ-списке.</summary>
        Task<IReadOnlyCollection<string>> GetBannedUserIdsAsync(IEnumerable<string> userIds);

        Task BanAuthorAsync(string userId, string bannedBy);

        Task<bool> UnbanAuthorAsync(string userId);
    }
}
