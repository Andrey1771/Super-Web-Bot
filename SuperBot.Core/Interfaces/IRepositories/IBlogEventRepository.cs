using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IBlogEventRepository
    {
        Task CreateAsync(BlogEvent blogEvent);
        Task<IReadOnlyList<BlogEvent>> GetRecentSinceAsync(DateTime fromUtc);
        Task<IReadOnlyList<BlogEvent>> GetRecentByPostAsync(string postId, DateTime fromUtc);

        /// <summary>
        /// Сколько РАЗНЫХ читателей совершили событие в каждой из статей. Считает база: список
        /// постов нужен целиком (лента, главная), а вытаскивать ради счётчика все события
        /// каждой статьи в память — это выборка за годы на каждую карточку.
        /// Читатель определяется так же, как в остальном блоге: аккаунт, иначе анонимный
        /// идентификатор, иначе сессия.
        /// </summary>
        Task<Dictionary<string, int>> CountDistinctActorsByPostsAsync(
            IEnumerable<string> postIds,
            string eventType,
            DateTime fromUtc);
    }
}
