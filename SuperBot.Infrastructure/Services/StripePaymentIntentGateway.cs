using Stripe;

namespace SuperBot.Infrastructure.Services
{
    /// <summary>
    /// Единственное место, где код обращается к Stripe за платёжными намерениями.
    /// Нужен как шов: без него финализация дёргала Stripe напрямую и её нельзя было
    /// протестировать без сети. Наружу отдаёт свои DTO, а не типы Stripe SDK.
    /// </summary>
    public interface IStripePaymentIntentGateway
    {
        Task<PaymentIntentSnapshot?> GetAsync(string paymentIntentId);
        Task<PaymentIntentSnapshot> CreateAsync(PaymentIntentDraft draft, string idempotencyKey);
        Task<PaymentIntentSnapshot?> UpdateAsync(string paymentIntentId, PaymentIntentDraft draft);
    }

    /// <summary>Что мы хотим от намерения: сумма, валюта и метаданные.</summary>
    public class PaymentIntentDraft
    {
        public long AmountMinorUnits { get; set; }
        public string Currency { get; set; } = "usd";
        public Dictionary<string, string> Metadata { get; set; } = new();
    }

    /// <summary>Снимок намерения — ровно те поля, которые нужны нашей логике.</summary>
    public class PaymentIntentSnapshot
    {
        public string Id { get; set; } = string.Empty;
        public string? Status { get; set; }
        public string? Currency { get; set; }
        public long Amount { get; set; }
        public long AmountReceived { get; set; }
        public string? ClientSecret { get; set; }
        public Dictionary<string, string> Metadata { get; set; } = new();

        /// <summary>Статусы, в которых сумму ещё можно менять.</summary>
        public bool IsUpdatable =>
            Status is "requires_payment_method" or "requires_confirmation" or "requires_action";

        public bool IsSucceeded =>
            string.Equals(Status, "succeeded", StringComparison.OrdinalIgnoreCase);

        public string? MetadataValue(string key) =>
            Metadata.TryGetValue(key, out var value) ? value : null;
    }

    public class StripePaymentIntentGateway : IStripePaymentIntentGateway
    {
        private readonly PaymentIntentService _service = new();

        public async Task<PaymentIntentSnapshot?> GetAsync(string paymentIntentId)
        {
            if (string.IsNullOrWhiteSpace(paymentIntentId))
            {
                return null;
            }

            var intent = await _service.GetAsync(paymentIntentId);
            return intent == null ? null : Map(intent);
        }

        public async Task<PaymentIntentSnapshot> CreateAsync(PaymentIntentDraft draft, string idempotencyKey)
        {
            var options = new PaymentIntentCreateOptions
            {
                Amount = draft.AmountMinorUnits,
                Currency = draft.Currency,
                Metadata = draft.Metadata,
                AutomaticPaymentMethods = new PaymentIntentAutomaticPaymentMethodsOptions { Enabled = true }
            };

            // Идемпотентный ключ защищает от создания дубля при сетевом повторе.
            var requestOptions = string.IsNullOrWhiteSpace(idempotencyKey)
                ? null
                : new RequestOptions { IdempotencyKey = idempotencyKey };

            var intent = await _service.CreateAsync(options, requestOptions);
            return Map(intent);
        }

        public async Task<PaymentIntentSnapshot?> UpdateAsync(string paymentIntentId, PaymentIntentDraft draft)
        {
            var intent = await _service.UpdateAsync(paymentIntentId, new PaymentIntentUpdateOptions
            {
                Amount = draft.AmountMinorUnits,
                Currency = draft.Currency,
                Metadata = draft.Metadata
            });

            return intent == null ? null : Map(intent);
        }

        private static PaymentIntentSnapshot Map(PaymentIntent intent) => new()
        {
            Id = intent.Id,
            Status = intent.Status,
            Currency = intent.Currency,
            Amount = intent.Amount,
            AmountReceived = intent.AmountReceived,
            ClientSecret = intent.ClientSecret,
            Metadata = intent.Metadata is null
                ? new Dictionary<string, string>()
                : new Dictionary<string, string>(intent.Metadata)
        };
    }
}
