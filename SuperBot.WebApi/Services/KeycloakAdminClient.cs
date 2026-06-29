using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SuperBot.WebApi.Services
{
    public class KeycloakAdminClient
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly SemaphoreSlim _tokenLock = new(1, 1);
        private string? _accessToken;
        private DateTimeOffset _tokenExpiresAt = DateTimeOffset.MinValue;

        public KeycloakAdminClient(HttpClient httpClient, IConfiguration configuration)
        {
            _httpClient = httpClient;
            _configuration = configuration;
        }

        private string BaseUrl => _configuration["Keycloak:Admin:BaseUrl"]?.TrimEnd('/') ?? string.Empty;
        private string Realm => _configuration["Keycloak:Admin:Realm"] ?? string.Empty;
        private string ClientId => _configuration["Keycloak:Admin:ClientId"] ?? string.Empty;
        private string ClientSecret => _configuration["Keycloak:Admin:ClientSecret"] ?? string.Empty;
        private string PublicClientId => _configuration["Keycloak:Admin:PublicClientId"] ?? ClientId;

        private string AdminUsersPath => $"{BaseUrl}/admin/realms/{Realm}/users";

        private async Task<string> GetAccessTokenAsync()
        {
            if (_accessToken != null && _tokenExpiresAt > DateTimeOffset.UtcNow.AddMinutes(1))
            {
                return _accessToken;
            }

            await _tokenLock.WaitAsync();
            try
            {
                if (_accessToken != null && _tokenExpiresAt > DateTimeOffset.UtcNow.AddMinutes(1))
                {
                    return _accessToken;
                }

                var content = new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["grant_type"] = "client_credentials",
                    ["client_id"] = ClientId,
                    ["client_secret"] = ClientSecret
                });

                var response = await _httpClient.PostAsync($"{BaseUrl}/realms/{Realm}/protocol/openid-connect/token", content);
                response.EnsureSuccessStatusCode();

                var payload = await response.Content.ReadFromJsonAsync<TokenResponse>();
                _accessToken = payload?.AccessToken;
                _tokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(payload?.ExpiresIn ?? 60);

                return _accessToken ?? string.Empty;
            }
            finally
            {
                _tokenLock.Release();
            }
        }

        private async Task<HttpRequestMessage> CreateAdminRequestAsync(HttpMethod method, string url)
        {
            var token = await GetAccessTokenAsync();
            var request = new HttpRequestMessage(method, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            return request;
        }

        public async Task<KeycloakUser?> GetUserAsync(string userId)
        {
            using var request = await CreateAdminRequestAsync(HttpMethod.Get, $"{AdminUsersPath}/{userId}");
            using var response = await _httpClient.SendAsync(request);
            if (response.StatusCode == HttpStatusCode.NotFound)
            {
                return null;
            }
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<KeycloakUser>(JsonOptions);
        }

        public async Task<List<KeycloakSession>> GetUserSessionsAsync(string userId)
        {
            using var request = await CreateAdminRequestAsync(HttpMethod.Get, $"{AdminUsersPath}/{userId}/sessions");
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<List<KeycloakSession>>(JsonOptions) ?? new List<KeycloakSession>();
        }

        public async Task<List<KeycloakCredential>> GetUserCredentialsAsync(string userId)
        {
            using var request = await CreateAdminRequestAsync(HttpMethod.Get, $"{AdminUsersPath}/{userId}/credentials");
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<List<KeycloakCredential>>(JsonOptions) ?? new List<KeycloakCredential>();
        }

        public async Task LogoutAllSessionsAsync(string userId)
        {
            using var request = await CreateAdminRequestAsync(HttpMethod.Post, $"{AdminUsersPath}/{userId}/logout");
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
        }

        public async Task LogoutSessionAsync(string sessionId)
        {
            using var request = await CreateAdminRequestAsync(HttpMethod.Delete, $"{BaseUrl}/admin/realms/{Realm}/sessions/{sessionId}");
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
        }

        public async Task SendVerifyEmailAsync(string userId)
        {
            using var request = await CreateAdminRequestAsync(HttpMethod.Put, $"{AdminUsersPath}/{userId}/send-verify-email");
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
        }

        public async Task ExecuteActionsEmailAsync(string userId, IEnumerable<string> actions, string? redirectUri = null, string? clientId = null)
        {
            var url = $"{AdminUsersPath}/{userId}/execute-actions-email";
            var query = new List<string>();
            if (!string.IsNullOrWhiteSpace(redirectUri))
            {
                query.Add($"redirect_uri={Uri.EscapeDataString(redirectUri)}");
            }
            if (!string.IsNullOrWhiteSpace(clientId))
            {
                query.Add($"client_id={Uri.EscapeDataString(clientId)}");
            }
            if (query.Count > 0)
            {
                url += "?" + string.Join("&", query);
            }

            using var request = await CreateAdminRequestAsync(HttpMethod.Put, url);
            request.Content = JsonContent.Create(actions);
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
        }

        public async Task ResetPasswordAsync(string userId, string newPassword, bool temporary = false)
        {
            using var request = await CreateAdminRequestAsync(HttpMethod.Put, $"{AdminUsersPath}/{userId}/reset-password");
            request.Content = JsonContent.Create(new
            {
                type = "password",
                temporary,
                value = newPassword
            });
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
        }

        public async Task UpdateEmailAsync(string userId, string email, bool emailVerified)
        {
            using var request = await CreateAdminRequestAsync(HttpMethod.Put, $"{AdminUsersPath}/{userId}");
            request.Content = JsonContent.Create(new { email, emailVerified });
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
        }

        public async Task DisableUserAsync(string userId)
        {
            using var request = await CreateAdminRequestAsync(HttpMethod.Put, $"{AdminUsersPath}/{userId}");
            request.Content = JsonContent.Create(new { enabled = false });
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
        }

        public async Task<bool> ValidatePasswordAsync(string username, string password)
        {
            if (string.IsNullOrWhiteSpace(PublicClientId))
            {
                return false;
            }

            var content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "password",
                ["client_id"] = PublicClientId,
                ["username"] = username,
                ["password"] = password
            });

            using var response = await _httpClient.PostAsync($"{BaseUrl}/realms/{Realm}/protocol/openid-connect/token", content);
            return response.IsSuccessStatusCode;
        }

        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNameCaseInsensitive = true
        };

        private sealed class TokenResponse
        {
            // Keycloak отдаёт snake_case; без атрибутов System.Text.Json не смаппит и токен будет пустым → 401.
            [JsonPropertyName("access_token")]
            public string AccessToken { get; set; } = string.Empty;

            [JsonPropertyName("expires_in")]
            public int ExpiresIn { get; set; }
        }
    }

    public sealed class KeycloakUser
    {
        public string Id { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public bool EmailVerified { get; set; }
        public string Username { get; set; } = string.Empty;
        public bool Enabled { get; set; }
    }

    public sealed class KeycloakSession
    {
        public string Id { get; set; } = string.Empty;
        public string IpAddress { get; set; } = string.Empty;
        public long Start { get; set; }
        public long LastAccess { get; set; }
        public string? Browser { get; set; }
        public string? Os { get; set; }
    }

    public sealed class KeycloakCredential
    {
        public string Type { get; set; } = string.Empty;
    }
}
