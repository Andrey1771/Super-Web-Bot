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

        /// <summary>
        /// Полный возврат платежа. idempotencyKey ОБЯЗАН быть детерминированным (например,
        /// от orderId): повтор при сетевом сбое не должен вернуть деньги дважды.
        /// true = деньги возвращены (или уже были возвращены ранее).
        /// </summary>
        Task<bool> RefundPaymentIntentAsync(string paymentIntentId, string idempotencyKey);
    }

    /// <summary>Что мы хотим от намерения: сумма, валюта и метаданные.</summary>
    public class PaymentIntentDraft
    {
        public long AmountMinorUnits { get; set; }
        public string Currency { get; set; } = "usd";
        public Dictionary<string, string> Metadata { get; set; } = new();

        /// <summary>Куда Stripe пришлёт чек. Для гостя это единственная квитанция о покупке.</summary>
        public string? ReceiptEmail { get; set; }
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
                ReceiptEmail = draft.ReceiptEmail,
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
                Metadata = draft.Metadata,
                ReceiptEmail = draft.ReceiptEmail
            });

            return intent == null ? null : Map(intent);
        }

        public async Task<bool> RefundPaymentIntentAsync(string paymentIntentId, string idempotencyKey)
        {
            try
            {
                var refunds = new RefundService();
                await refunds.CreateAsync(
                    new RefundCreateOptions { PaymentIntent = paymentIntentId },
                    new RequestOptions { IdempotencyKey = idempotencyKey });
                return true;
            }
            catch (StripeException ex) when (ex.StripeError?.Code == "charge_already_refunded")
            {
                // Деньги уже возвращены (например, админ успел руками) — цель достигнута.
                return true;
            }
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
