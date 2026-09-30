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
        /// <param name="amountMinorUnits">Сумма частичного возврата в минорных единицах; null — весь остаток платежа.</param>
        Task<bool> RefundPaymentIntentAsync(string paymentIntentId, string idempotencyKey, long? amountMinorUnits = null);

        /// <summary>
        /// Валюта выплат аккаунта Stripe (default_currency), заглавными: в ней Stripe проверяет минимальную сумму
        /// платежа. Меняется только в кабинете Stripe, поэтому запрашивается редко и держится в памяти.
        /// </summary>
        Task<string?> GetSettlementCurrencyAsync();
    }

    /// <summary>Что мы хотим от намерения: сумма, валюта и метаданные.</summary>
    public class PaymentIntentDraft
    {
        public long AmountMinorUnits { get; set; }
        public string Currency { get; set; } = "usd";
        public Dictionary<string, string> Metadata { get; set; } = new();

        /// <summary>Куда Stripe пришлёт чек. Для гостя это единственная квитанция о покупке.</summary>
        public string? ReceiptEmail { get; set; }

        /// <summary>
        /// Покупатель Stripe вошедшего пользователя. С ним форма карты показывает его сохранённые карты и предлагает
        /// сохранить новую; карта после оплаты остаётся у покупателя. Гость платит без покупателя.
        /// </summary>
        public string? CustomerId { get; set; }
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
        /// <summary>Покупатель Stripe, к которому привязано намерение; null у гостя.</summary>
        public string? CustomerId { get; set; }

        /// <summary>Страна и индекс из платёжных данных (форма карты спрашивает их сама) — место покупателя для налога.</summary>
        public string? BillingCountry { get; set; }
        public string? BillingPostalCode { get; set; }
        /// <summary>Страна банка, выпустившего карту, — запасное основание, если адреса нет.</summary>
        public string? CardCountry { get; set; }

        /// <summary>Чем заплатили: card, paypal, link…; бренд и последние цифры карты; кошелёк (apple_pay, google_pay).</summary>
        public string? PaymentMethodType { get; set; }
        public string? CardBrand { get; set; }
        public string? CardLast4 { get; set; }
        public string? CardWallet { get; set; }

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

            // latest_charge — ради платёжного адреса и страны карты: по ним после оплаты считается окончательный налог.
            var intent = await _service.GetAsync(paymentIntentId, new PaymentIntentGetOptions { Expand = new List<string> { "latest_charge" } });
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
                Customer = draft.CustomerId,
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
            var options = new PaymentIntentUpdateOptions
            {
                Amount = draft.AmountMinorUnits,
                Currency = draft.Currency,
                Metadata = draft.Metadata,
                // Покупателя у намерения не отбираем: null здесь значит «не менять», а не «отвязать».
                Customer = draft.CustomerId
            };
            // С Stripe.net 51 явно присвоенный null у ReceiptEmail уходит как receipt_email= и стирает
            // адрес для чека. Нет адреса в черновике — поле не трогаем, как было до обновления SDK.
            if (!string.IsNullOrWhiteSpace(draft.ReceiptEmail))
            {
                options.ReceiptEmail = draft.ReceiptEmail;
            }

            var intent = await _service.UpdateAsync(paymentIntentId, options);

            return intent == null ? null : Map(intent);
        }

        private static readonly TimeSpan SettlementCurrencyTtl = TimeSpan.FromHours(12);
        private static readonly SemaphoreSlim SettlementCurrencyLock = new(1, 1);
        private static (string? Currency, DateTime At) _settlementCurrency;

        public async Task<string?> GetSettlementCurrencyAsync()
        {
            if (_settlementCurrency.Currency != null && DateTime.UtcNow - _settlementCurrency.At < SettlementCurrencyTtl)
            {
                return _settlementCurrency.Currency;
            }

            await SettlementCurrencyLock.WaitAsync();
            try
            {
                if (_settlementCurrency.Currency != null && DateTime.UtcNow - _settlementCurrency.At < SettlementCurrencyTtl)
                {
                    return _settlementCurrency.Currency;
                }

                var account = await new AccountService().GetSelfAsync();
                var currency = string.IsNullOrWhiteSpace(account?.DefaultCurrency) ? null : account.DefaultCurrency.Trim().ToUpperInvariant();
                if (currency != null)
                {
                    _settlementCurrency = (currency, DateTime.UtcNow);
                }
                return currency;
            }
            finally
            {
                SettlementCurrencyLock.Release();
            }
        }

        public async Task<bool> RefundPaymentIntentAsync(string paymentIntentId, string idempotencyKey, long? amountMinorUnits = null)
        {
            try
            {
                var refunds = new RefundService();
                await refunds.CreateAsync(
                    new RefundCreateOptions { PaymentIntent = paymentIntentId, Amount = amountMinorUnits },
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
            CustomerId = intent.CustomerId,
            BillingCountry = intent.LatestCharge?.BillingDetails?.Address?.Country,
            BillingPostalCode = intent.LatestCharge?.BillingDetails?.Address?.PostalCode,
            CardCountry = intent.LatestCharge?.PaymentMethodDetails?.Card?.Country,
            PaymentMethodType = intent.LatestCharge?.PaymentMethodDetails?.Type,
            CardBrand = intent.LatestCharge?.PaymentMethodDetails?.Card?.Brand,
            CardLast4 = intent.LatestCharge?.PaymentMethodDetails?.Card?.Last4,
            CardWallet = intent.LatestCharge?.PaymentMethodDetails?.Card?.Wallet?.Type,
            Metadata = intent.Metadata is null
                ? new Dictionary<string, string>()
                : new Dictionary<string, string>(intent.Metadata)
        };
    }
}
