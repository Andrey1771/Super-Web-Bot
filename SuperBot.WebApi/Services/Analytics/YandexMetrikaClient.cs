using System.Text.Json;

namespace SuperBot.WebApi.Services.Analytics
{
    public class YandexMetrikaClient
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;

        public YandexMetrikaClient(IHttpClientFactory httpClientFactory, IConfiguration configuration)
        {
            _httpClientFactory = httpClientFactory;
            _configuration = configuration;
        }

        public async Task<JsonDocument> GetStatsAsync(string counterId, IDictionary<string, string> parameters)
        {
            var token = _configuration["Analytics:Yandex:Token"];
            if (string.IsNullOrWhiteSpace(token))
            {
                throw new InvalidOperationException("Yandex Metrika token is not configured.");
            }

            var client = _httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("OAuth", token);

            var query = new List<string>();
            foreach (var pair in parameters)
            {
                query.Add($"{pair.Key}={Uri.EscapeDataString(pair.Value)}");
            }

            var endpoint = $"https://api-metrika.yandex.net/stat/v1/data?ids={counterId}&{string.Join("&", query)}";
            var response = await client.GetAsync(endpoint);
            response.EnsureSuccessStatusCode();

            var stream = await response.Content.ReadAsStreamAsync();
            return await JsonDocument.ParseAsync(stream);
        }
    }
}
