using System.Net.Http.Headers;
using System.Linq;
using System.Text;
using System.Text.Json;
using SuperBot.Core.Entities;

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

        /// <summary>
        /// Доступ на чтение отчётов. Значение из настроек магазина важнее переменной окружения:
        /// настройки заводит владелец в панели и меняет когда угодно, а переменная задаётся один
        /// раз при развёртывании и требует перезапуска. Переменные оставлены запасным путём —
        /// для установок, где панель не открывают вовсе.
        /// </summary>
        public GaReportCredentials Resolve(AnalyticsSettings settings) => new(
            Pick(settings?.GaOauthClientId, "Analytics:Google:ClientId"),
            Pick(settings?.GaOauthClientSecret, "Analytics:Google:ClientSecret"),
            Pick(settings?.GaOauthRefreshToken, "Analytics:Google:RefreshToken"));

        private string Pick(string fromSettings, string configKey) =>
            string.IsNullOrWhiteSpace(fromSettings) ? _configuration[configKey] : fromSettings;

        /// <summary>
        /// Чего именно не хватает — человеческими названиями полей формы. Отличать «доступ не
        /// настроен» от «доступ есть, но запрос не прошёл» обязательно: иначе панель показывает
        /// ошибку там, где настройки просто не заводили.
        ///
        /// Наружу уходят только названия. Значения не показываются никому и ни при каких условиях.
        /// </summary>
        public IReadOnlyList<string> MissingCredentials(AnalyticsSettings settings)
        {
            var resolved = Resolve(settings);
            var missing = new List<string>();
            if (string.IsNullOrWhiteSpace(resolved.ClientId)) missing.Add("Client ID");
            if (string.IsNullOrWhiteSpace(resolved.ClientSecret)) missing.Add("Client secret");
            if (string.IsNullOrWhiteSpace(resolved.RefreshToken)) missing.Add("Refresh token");
            return missing;
        }

        public bool HasCredentials(AnalyticsSettings settings) => MissingCredentials(settings).Count == 0;

        public async Task<JsonDocument> RunReportAsync(string propertyId, object payload, AnalyticsSettings settings = null)
        {
            var accessToken = await GetAccessTokenAsync(settings);
            if (string.IsNullOrWhiteSpace(accessToken))
            {
                throw new InvalidOperationException("Google Analytics access token is not configured.");
            }

            var client = _httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

            var endpoint = $"https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runReport";
            var requestBody = JsonSerializer.Serialize(payload);
            var response = await client.PostAsync(endpoint, new StringContent(requestBody, Encoding.UTF8, "application/json"));

            if (!response.IsSuccessStatusCode)
            {
                // Свои слова Google говорит лучше наших догадок: «нет прав на этот ресурс» и
                // «такого ресурса нет» требуют разных действий, а под общей фразой «отказано»
                // они неразличимы.
                var body = await response.Content.ReadAsStringAsync();
                throw new Ga4AccessException("report_failed", ExtractGoogleMessage(body)
                    ?? $"Google answered {(int)response.StatusCode}.");
            }

            var stream = await response.Content.ReadAsStreamAsync();
            return await JsonDocument.ParseAsync(stream);
        }

        private async Task<string> GetAccessTokenAsync(AnalyticsSettings settings)
        {
            var (clientId, clientSecret, refreshToken) = Resolve(settings);

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
            var json = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                using var error = JsonDocument.Parse(json);
                var code = error.RootElement.TryGetProperty("error", out var e) ? e.GetString() : null;
                var description = error.RootElement.TryGetProperty("error_description", out var d)
                    ? d.GetString()
                    : null;

                // invalid_grant — единственный случай, который стоит называть отдельно: так
                // Google отвечает и на истёкший через семь дней токен приложения в статусе
                // Testing, и на отозванный вручную. Действие в обоих случаях одно — получить
                // токен заново, — и оно совсем не то, что при неверном Property ID.
                throw new Ga4AccessException(
                    code == "invalid_grant" ? "token_rejected" : "token_failed",
                    description ?? code ?? $"Google answered {(int)response.StatusCode}.");
            }

            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.GetProperty("access_token").GetString();
        }

        /// <summary>Текст ошибки из ответа Data API. Ключей и токенов в нём нет — только объяснение.</summary>
        private static string ExtractGoogleMessage(string body)
        {
            try
            {
                using var doc = JsonDocument.Parse(body);
                return doc.RootElement.TryGetProperty("error", out var error)
                    && error.TryGetProperty("message", out var message)
                        ? message.GetString()
                        : null;
            }
            catch (JsonException)
            {
                return null;
            }
        }
    }

    /// <summary>
    /// Отказ со стороны Google с его собственным объяснением. Отделён от прочих исключений,
    /// потому что показывать пользователю можно именно его: там нет ни ключей, ни внутренностей.
    /// </summary>
    public class Ga4AccessException : Exception
    {
        public Ga4AccessException(string code, string message) : base(message) => Code = code;

        /// <summary>token_rejected · token_failed · report_failed.</summary>
        public string Code { get; }
    }

    /// <summary>Тройка доступа к отчётам после подстановки: настройки важнее окружения.</summary>
    public readonly record struct GaReportCredentials(string ClientId, string ClientSecret, string RefreshToken);
}
