using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IGameDetailsRepository
    {
        Task<GameDetails> GetByGameIdAsync(string gameId);
        Task<GameDetails> GetBySlugAsync(string slug);
        Task CreateAsync(GameDetails details);
        Task UpsertAsync(GameDetails details);
        Task UpdateAsync(string id, GameDetails details);
    }
}
