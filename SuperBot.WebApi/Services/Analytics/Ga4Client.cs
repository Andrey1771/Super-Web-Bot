using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace SuperBot.WebApi.Services.Analytics
{
    public class Ga4Client
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;

        public Ga4Client(IHttpClientFactory httpClientFactory, IConfiguration configuration)
        {
            _httpClientFactory = httpClientFactory;
            _configuration = configuration;
        }

        public async Task<JsonDocument> RunReportAsync(string propertyId, object payload)
        {
            var accessToken = await GetAccessTokenAsync();
            if (string.IsNullOrWhiteSpace(accessToken))
            {
                throw new InvalidOperationException("Google Analytics access token is not configured.");
            }

            var client = _httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

            var endpoint = $"https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runReport";
            var requestBody = JsonSerializer.Serialize(payload);
            var response = await client.PostAsync(endpoint, new StringContent(requestBody, Encoding.UTF8, "application/json"));
            response.EnsureSuccessStatusCode();

            var stream = await response.Content.ReadAsStreamAsync();
            return await JsonDocument.ParseAsync(stream);
        }

        private async Task<string> GetAccessTokenAsync()
        {
            var clientId = _configuration["Analytics:Google:ClientId"];
            var clientSecret = _configuration["Analytics:Google:ClientSecret"];
            var refreshToken = _configuration["Analytics:Google:RefreshToken"];

            if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret) || string.IsNullOrWhiteSpace(refreshToken))
            {
                return null;
            }

            var client = _httpClientFactory.CreateClient();
            var form = new Dictionary<string, string>
            {
                ["client_id"] = clientId,
                ["client_secret"] = clientSecret,
                ["refresh_token"] = refreshToken,
                ["grant_type"] = "refresh_token"
            };

            var response = await client.PostAsync("https://oauth2.googleapis.com/token", new FormUrlEncodedContent(form));
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.GetProperty("access_token").GetString();
        }
    }
}
