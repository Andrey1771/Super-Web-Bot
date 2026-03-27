using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories;

public interface IGameDiscountRepository
{
    Task<GameDiscount?> GetByGameIdAsync(string gameId);
    Task<List<GameDiscount>> GetByGameIdsAsync(IEnumerable<string> gameIds);
    Task UpsertAsync(GameDiscount discount);
    Task DeleteByGameIdAsync(string gameId);
}
