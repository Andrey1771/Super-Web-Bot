using System.Collections.Generic;
using System.Threading.Tasks;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IWishlistRepository
    {
        Task<HashSet<string>> GetGameIdsAsync(string userId);
        Task AddAsync(string userId, string gameId);
        Task RemoveAsync(string userId, string gameId);
        Task<HashSet<string>> MergeAsync(string userId, IEnumerable<string> guestIds);

        /// <summary>Обратный запрос: кто добавил игру в wishlist (для алертов о скидках).</summary>
        Task<List<string>> GetUserIdsByGameAsync(string gameId);
    }
}
