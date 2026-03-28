using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IGameDetailsRepository
    {
        Task<GameDetails> GetByGameIdAsync(string gameId);
        Task<List<GameDetails>> GetByGameIdsAsync(IEnumerable<string> gameIds);
        Task<GameDetails> GetBySlugAsync(string slug);
        Task CreateAsync(GameDetails details);
        Task UpsertAsync(GameDetails details);
        Task UpdateAsync(string id, GameDetails details);
    }
}
