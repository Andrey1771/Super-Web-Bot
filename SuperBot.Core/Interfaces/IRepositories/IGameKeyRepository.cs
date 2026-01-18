using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IGameKeyRepository
    {
        Task<List<GameKey>> GetByUserAsync(string userId, int limit);
        Task AddAsync(GameKey gameKey);
    }
}
