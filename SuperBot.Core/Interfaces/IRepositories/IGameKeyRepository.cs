using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IGameKeyRepository
    {
        Task<List<GameKey>> GetByUserAsync(string userId, int limit);
        Task AddAsync(GameKey gameKey);

        // Инвентарь (B): пул-ключ — это GameKey с пустым UserId (ещё не выдан).
        Task AddPoolKeysAsync(string gameId, string keyType, IEnumerable<string> keys);
        Task<int> CountAvailableByGameAsync(string gameId);
        Task<int> CountAssignedByGameAsync(string gameId);
        // Атомарно берёт один свободный ключ из пула игры и закрепляет за пользователем (null — пул пуст).
        Task<GameKey> TryDispensePoolKeyAsync(string gameId, string userId);
    }
}
