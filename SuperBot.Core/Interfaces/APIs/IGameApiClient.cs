using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.APIs
{
    public interface IGameApiClient
    {
        public Task<IEnumerable<Game>> GetAllGamesAsync();
        public Task<Game> GetGameByIdAsync(string id);
        public Task CreateGameAsync(Game newGame);
        public Task UpdateGameAsync(string id, Game updatedGame);
        public Task DeleteGameAsync(string id);
    }
}
