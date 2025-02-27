using SuperBot.Core.Interfaces;
using System.Net.Http.Headers;
using System.Text.Json;

namespace SuperBot.WebApi.Services
{
    public class KeycloakClient : IKeycloakClient
    {
        private readonly HttpClient _httpClient;
        private readonly string _baseUrl;

        public KeycloakClient(HttpClient httpClient, string baseUrl)
        {
            _httpClient = httpClient;
            _baseUrl = baseUrl.TrimEnd('/');
        }

        public async Task<OrganizationRepresentation> GetOrganizationAsync(string realm, string orgId, string accessToken)
        {
            var requestUrl = $"{_baseUrl}/admin/realms/{realm}/organizations/{orgId}";

            using var request = new HttpRequestMessage(HttpMethod.Get, requestUrl);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();

            var responseStream = await response.Content.ReadAsStreamAsync();
            return await JsonSerializer.DeserializeAsync<OrganizationRepresentation>(responseStream, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }

        public async Task<List<OrganizationRepresentation>> GetOrganizationsAsync(string realm, string accessToken)
        {
            var requestUrl = $"{_baseUrl}/admin/realms/{realm}/organizations";

            using var request = new HttpRequestMessage(HttpMethod.Get, requestUrl);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();

            var responseStream = await response.Content.ReadAsStreamAsync();
            return await JsonSerializer.DeserializeAsync<List<OrganizationRepresentation>>(responseStream, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }

        public async Task<List<dynamic>> GetUserCredentialsAsync(string realm, string userId, string accessToken)
        {
            var requestUrl = $"{_baseUrl}/admin/realms/{realm}/users/{userId}/credentials";

            using var request = new HttpRequestMessage(HttpMethod.Get, requestUrl);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();

            var responseStream = await response.Content.ReadAsStreamAsync();
            return await JsonSerializer.DeserializeAsync<List<dynamic>>(responseStream, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }

        public async Task<List<LoginEventRepresentation>> GetUserLoginEventsAsync(string realm, string userId, string accessToken)
        {
            var requestUrl = $"{_baseUrl}/admin/realms/{realm}/events?type=LOGIN&userId={userId}";

            using var request = new HttpRequestMessage(HttpMethod.Get, requestUrl);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();

            var responseStream = await response.Content.ReadAsStreamAsync();
            return await JsonSerializer.DeserializeAsync<List<LoginEventRepresentation>>(responseStream, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }

        public async Task<List<LoginEventRepresentation>> GetAllLoginEventsAsync(string realm, string accessToken)
        {
            var requestUrl = $"{_baseUrl}/admin/realms/{realm}/events?type=LOGIN";

            using var request = new HttpRequestMessage(HttpMethod.Get, requestUrl);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();

            var responseStream = await response.Content.ReadAsStreamAsync();
            return await JsonSerializer.DeserializeAsync<List<LoginEventRepresentation>>(responseStream, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }

        public async Task<List<UserSessionRepresentation>> GetUserSessionsAsync(string realm, string userId, string accessToken)
        {
            var requestUrl = $"{_baseUrl}/admin/realms/{realm}/users/{userId}/sessions";

            using var request = new HttpRequestMessage(HttpMethod.Get, requestUrl);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();

            var responseStream = await response.Content.ReadAsStreamAsync();
            return await JsonSerializer.DeserializeAsync<List<UserSessionRepresentation>>(responseStream, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
    }
}
