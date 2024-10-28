using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.APIs;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http.Json;
using System.Text;
using System.Threading.Tasks;

namespace SuperBot.Core.Services.APIs
{
    public class UserApiClient(HttpClient _httpClient) : IUserApiClient
    {
        public async Task<IEnumerable<User>> GetAllUsersAsync()
        {
            var response = await _httpClient.GetAsync("https://your-api-url/api/user");
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<IEnumerable<User>>();
        }

        public async Task<User> GetUserByIdAsync(string id)
        {
            var response = await _httpClient.GetAsync($"https://your-api-url/api/user/{id}");
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<User>();
        }

        public async Task CreateUserAsync(User newUser)
        {
            var response = await _httpClient.PostAsJsonAsync("https://your-api-url/api/user", newUser);
            response.EnsureSuccessStatusCode();
        }

        public async Task UpdateUserAsync(string id, User updatedUser)
        {
            var response = await _httpClient.PutAsJsonAsync($"https://your-api-url/api/user/{id}", updatedUser);
            response.EnsureSuccessStatusCode();
        }

        public async Task DeleteUserAsync(string id)
        {
            var response = await _httpClient.DeleteAsync($"https://your-api-url/api/user/{id}");
            response.EnsureSuccessStatusCode();
        }
    }
}
