using System.Collections.Generic;
using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IGameRepository
    {
        Task<List<Game>> GetAllAsync();
        Task<Game> GetByIdAsync(string id);
        Task<List<Game>> GetByIdsAsync(IEnumerable<string> ids);
        Task CreateAsync(Game game);
        Task UpdateAsync(string id, Game updatedGame);
        Task DeleteAsync(string id);
    }
}
