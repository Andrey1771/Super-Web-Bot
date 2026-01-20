using System.Net.Http.Headers;
using System.Net.Http.Json;

namespace SuperBot.WebApi.Services
{
    public class KeycloakAccountService
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;

        public KeycloakAccountService(HttpClient httpClient, IConfiguration configuration)
        {
            _httpClient = httpClient;
            _configuration = configuration;
        }

        private string BaseUrl => _configuration["Keycloak:Uri"]?.TrimEnd('/') ?? string.Empty;
        private string Realm => _configuration["Keycloak:Realm"] ?? string.Empty;
        private string ClientId => _configuration["Keycloak:ClientId"] ?? string.Empty;

        private HttpRequestMessage CreateRequest(HttpMethod method, string path, string accessToken)
        {
            var request = new HttpRequestMessage(method, $"{BaseUrl}/realms/{Realm}/account{path}");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            return request;
        }

        public async Task SendVerificationEmailAsync(string accessToken)
        {
            using var request = CreateRequest(HttpMethod.Post, "/send-verify-email", accessToken);
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
        }

        public async Task UpdateEmailAsync(string accessToken, string email)
        {
            using var request = CreateRequest(HttpMethod.Post, string.Empty, accessToken);
            request.Content = JsonContent.Create(new { email });
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
        }

        public async Task ChangePasswordAsync(string accessToken, string currentPassword, string newPassword)
        {
            using var request = CreateRequest(HttpMethod.Post, "/credentials/password", accessToken);
            request.Content = JsonContent.Create(new { currentPassword, newPassword });
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
        }

        public async Task DeleteAccountAsync(string accessToken)
        {
            using var request = CreateRequest(HttpMethod.Delete, string.Empty, accessToken);
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
        }

        public async Task<bool> ValidatePasswordAsync(string username, string password)
        {
            if (string.IsNullOrWhiteSpace(BaseUrl) || string.IsNullOrWhiteSpace(Realm) || string.IsNullOrWhiteSpace(ClientId))
            {
                return false;
            }

            var content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "password",
                ["client_id"] = ClientId,
                ["username"] = username,
                ["password"] = password
            });

            using var response = await _httpClient.PostAsync($"{BaseUrl}/realms/{Realm}/protocol/openid-connect/token", content);
            return response.IsSuccessStatusCode;
        }
    }
}
