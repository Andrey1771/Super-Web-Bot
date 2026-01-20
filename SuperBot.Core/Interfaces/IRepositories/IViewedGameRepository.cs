using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IViewedGameRepository
    {
        Task<List<ViewedGame>> GetRecentAsync(string userId, int limit);
        Task UpsertAsync(string userId, string gameId, string source = null);
    }
}
