using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.APIs;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http.Json;
using System.Text;
using System.Threading.Tasks;

namespace SuperBot.Core.Services.APIs
{
    public class GameApiClient(HttpClient _httpClient, IUrlService _urlService) : IGameApiClient
    {
        public async Task<IEnumerable<Game>> GetAllGamesAsync()
        {
            var response = await _httpClient.GetAsync($"{_urlService.MainUrl}/api/game");
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<IEnumerable<Game>>();
        }

        public async Task<Game> GetGameByIdAsync(string id)
        {
            var response = await _httpClient.GetAsync($"{_urlService.MainUrl}/api/game/{id}");
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<Game>();
        }

        public async Task CreateGameAsync(Game newGame)
        {
            var response = await _httpClient.PostAsJsonAsync($"{_urlService.MainUrl}/api/game", newGame);
            response.EnsureSuccessStatusCode();
        }

        public async Task UpdateGameAsync(string id, Game updatedGame)
        {
            var response = await _httpClient.PutAsJsonAsync($"{_urlService.MainUrl}/api/game/{id}", updatedGame);
            response.EnsureSuccessStatusCode();
        }

        public async Task DeleteGameAsync(string id)
        {
            var response = await _httpClient.DeleteAsync($"{_urlService.MainUrl}/api/game/{id}");
            response.EnsureSuccessStatusCode();
        }
    }
}
