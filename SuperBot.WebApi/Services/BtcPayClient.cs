using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SuperBot.WebApi.Services
{
    /// <summary>
    /// Настройки BTCPay Server (Greenfield API). Демо-режим: testnet-инстанс, реальные деньги не участвуют.
    /// Все поля пустые = крипто-оплата на сайте выключена (кнопка не показывается).
    /// </summary>
    public class BtcPayOptions
    {
        public string BaseUrl { get; set; } = string.Empty;
        public string ApiKey { get; set; } = string.Empty;
        public string StoreId { get; set; } = string.Empty;
        public string WebhookSecret { get; set; } = string.Empty;

        /// <summary>
        /// Рельс включён. По умолчанию **выключен**: крипта осталась в коде как рабочая
        /// демо-интеграция, но магазином не предлагается. Раньше единственным выключателем
        /// было отсутствие ключей — то есть «выключено» и «не настроено» выглядели одинаково,
        /// и вернуть рельс означало вспомнить, что именно там было настроено.
        /// Ставится в true вместе с ключами, когда рельс действительно понадобится.
        /// </summary>
        public bool Enabled { get; set; }

        /// <summary>Ключи заданы — с BTCPay технически можно разговаривать.</summary>
        public bool IsConfigured =>
            !string.IsNullOrWhiteSpace(BaseUrl) &&
            !string.IsNullOrWhiteSpace(ApiKey) &&
            !string.IsNullOrWhiteSpace(StoreId);

        /// <summary>Рельс доступен покупателю: и включён, и настроен.</summary>
        public bool IsAvailable => Enabled && IsConfigured;
    }

    public sealed record BtcPayInvoice(string Id, string CheckoutLink, string Status);

    /// <summary>
    /// Мини-клиент BTCPay Greenfield API: создание инвойса и чтение его статуса.
    /// </summary>
    public class BtcPayClient
    {
        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
        };

        private readonly HttpClient _httpClient;
        private readonly BtcPayOptions _options;

        public BtcPayClient(HttpClient httpClient, Microsoft.Extensions.Options.IOptions<BtcPayOptions> options)
        {
            _options = options.Value;
            _httpClient = httpClient;
            if (_options.IsConfigured)
            {
                _httpClient.BaseAddress = new Uri(_options.BaseUrl.TrimEnd('/') + "/");
                _httpClient.DefaultRequestHeaders.Add("Authorization", $"token {_options.ApiKey}");
            }
        }

        public async Task<BtcPayInvoice> CreateInvoiceAsync(decimal amountUsd, string redirectUrl, Dictionary<string, string> metadata, CancellationToken ct)
        {
            var payload = new
            {
                amount = amountUsd.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture),
                currency = "USD",
                metadata,
                checkout = new
                {
                    redirectURL = redirectUrl,
                    redirectAutomatically = true
                }
            };

            var content = new StringContent(JsonSerializer.Serialize(payload, JsonOptions), Encoding.UTF8, "application/json");
            var response = await _httpClient.PostAsync($"api/v1/stores/{_options.StoreId}/invoices", content, ct);
            var body = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"BTCPay invoice creation failed ({(int)response.StatusCode}): {body}");
            }

            return ParseInvoice(body);
        }

        public async Task<BtcPayInvoice> GetInvoiceAsync(string invoiceId, CancellationToken ct)
        {
            var response = await _httpClient.GetAsync($"api/v1/stores/{_options.StoreId}/invoices/{invoiceId}", ct);
            var body = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"BTCPay invoice lookup failed ({(int)response.StatusCode}): {body}");
            }

            return ParseInvoice(body);
        }

        private static BtcPayInvoice ParseInvoice(string json)
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            return new BtcPayInvoice(
                root.GetProperty("id").GetString() ?? string.Empty,
                root.TryGetProperty("checkoutLink", out var link) ? link.GetString() ?? string.Empty : string.Empty,
                root.TryGetProperty("status", out var status) ? status.GetString() ?? string.Empty : string.Empty);
        }
    }
}
