using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IGameRepository
    {
        Task<List<Game>> GetAllAsync();
        Task<Game> GetByIdAsync(string id);
        Task CreateAsync(Game game);
        Task UpdateAsync(string id, Game updatedGame);
        Task DeleteAsync(string id);
    }
}
