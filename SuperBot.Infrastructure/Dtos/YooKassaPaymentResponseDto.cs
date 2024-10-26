using System.Text.Json.Serialization;

namespace SuperBot.Infrastructure.Dtos
{
    public class Amount
    {
        [JsonPropertyName("value")]
        public string Value { get; set; }

        [JsonPropertyName("currency")]
        public string Currency { get; set; }
    }

    public class Recipient
    {
        [JsonPropertyName("account_id")]
        public string AccountId { get; set; }

        [JsonPropertyName("gateway_id")]
        public string GatewayId { get; set; }
    }

    public class Confirmation
    {
        [JsonPropertyName("type")]
        public string Type { get; set; }

        [JsonPropertyName("confirmation_url")]
        public string ConfirmationUrl { get; set; }
    }

    public class YooKassaPaymentResponseDto
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("status")]
        public string Status { get; set; }

        [JsonPropertyName("amount")]
        public Amount Amount { get; set; }

        [JsonPropertyName("description")]
        public string Description { get; set; }

        [JsonPropertyName("recipient")]
        public Recipient Recipient { get; set; }

        [JsonPropertyName("created_at")]
        public DateTime CreatedAt { get; set; }

        [JsonPropertyName("confirmation")]
        public Confirmation Confirmation { get; set; }

        [JsonPropertyName("test")]
        public bool Test { get; set; }

        [JsonPropertyName("paid")]
        public bool Paid { get; set; }

        [JsonPropertyName("refundable")]
        public bool Refundable { get; set; }

        [JsonPropertyName("metadata")]
        public object Metadata { get; set; }
    }
}
