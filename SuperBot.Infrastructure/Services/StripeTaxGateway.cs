using Stripe;

namespace SuperBot.Infrastructure.Services
{
    /// <summary>
    /// Единственное место обращения к Stripe Tax. Шов, как и у платёжных намерений: без него налог нельзя
    /// проверить без сети. Наружу — свои DTO, а не типы SDK.
    /// </summary>
    public interface IStripeTaxGateway
    {
        /// <summary>Расчёт налога. Бросает исключение, если Stripe не смог (нет места покупателя, Tax не включён, сеть).</summary>
        Task<TaxCalculationSnapshot> CalculateAsync(TaxCalculationDraft draft);

        /// <summary>Записывает транзакцию по расчёту — она попадает в налоговые отчёты. Возвращает её id.</summary>
        Task<string> CreateTransactionAsync(string calculationId, string reference, string idempotencyKey);

        /// <summary>Сторно транзакции при возврате: целиком или на сумму с налогом. Возвращает id сторно.</summary>
        Task<string> ReverseTransactionAsync(TaxReversalDraft draft, string idempotencyKey);
    }

    public class TaxCalculationDraft
    {
        public string Currency { get; set; } = "usd";
        public List<TaxLineDraft> Lines { get; set; } = new();
        /// <summary>Код товара Stripe Tax по умолчанию — для строк без своего кода (у строк свой: игра, ПО, подписка).</summary>
        public string TaxCode { get; set; } = string.Empty;
        /// <summary>Место покупателя: страна (+ индекс, обязателен для США) или IP. Страна важнее.</summary>
        public string? Country { get; set; }
        public string? PostalCode { get; set; }
        public string? IpAddress { get; set; }
    }

    public class TaxLineDraft
    {
        public string Reference { get; set; } = string.Empty;
        /// <summary>Сумма строки с налогом внутри (цены каталога включают налог), в минорных единицах.</summary>
        public long AmountMinor { get; set; }
        public int Quantity { get; set; } = 1;
        /// <summary>Налоговый код строки (игра, ПО, подписка). Пусто — код черновика.</summary>
        public string? TaxCode { get; set; }
    }

    public class TaxCalculationSnapshot
    {
        public string Id { get; set; } = string.Empty;
        public long AmountTotalMinor { get; set; }
        /// <summary>Налог внутри сумм строк. Надбавки сверху нет — цены с налогом.</summary>
        public long TaxInclusiveMinor { get; set; }
        public string? Country { get; set; }
        public string? State { get; set; }
        public string? TaxType { get; set; }
        public decimal? RatePercent { get; set; }
        public string? TaxabilityReason { get; set; }
        public DateTime? ExpiresAt { get; set; }
    }

    public class TaxReversalDraft
    {
        public string OriginalTransactionId { get; set; } = string.Empty;
        /// <summary>Уникален среди всех транзакций аккаунта.</summary>
        public string Reference { get; set; } = string.Empty;
        public bool Full { get; set; }
        /// <summary>Для частичного: сколько вернуть с налогом, положительное число (Stripe ждёт отрицательное — знак ставит шлюз).</summary>
        public long AmountMinor { get; set; }
    }

    public class StripeTaxGateway : IStripeTaxGateway
    {
        /// <summary>
        /// Короткий таймаут и один повтор: расчёт стоит на пути кассы, а по умолчанию SDK ждёт 80 секунд. Налог внутри
        /// цены, без него оплата проходит — ждать его дольше нескольких секунд нельзя.
        /// </summary>
        private static readonly System.Net.Http.HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(8) };

        private Stripe.Tax.CalculationService? _calculationService;
        private Stripe.Tax.TransactionService? _transactionService;

        // Клиент собирается при первом вызове: ключ Stripe выставляется при старте приложения, уже после регистрации сервисов.
        private IStripeClient Client() => new StripeClient(StripeConfiguration.ApiKey, httpClient: new SystemNetHttpClient(Http, maxNetworkRetries: 1));
        private Stripe.Tax.CalculationService _calculations => _calculationService ??= new Stripe.Tax.CalculationService(Client());
        private Stripe.Tax.TransactionService _transactions => _transactionService ??= new Stripe.Tax.TransactionService(Client());

        public async Task<TaxCalculationSnapshot> CalculateAsync(TaxCalculationDraft draft)
        {
            var customer = new Stripe.Tax.CalculationCustomerDetailsOptions();
            if (!string.IsNullOrWhiteSpace(draft.Country))
            {
                customer.Address = new AddressOptions { Country = draft.Country, PostalCode = draft.PostalCode };
                customer.AddressSource = "billing";
            }
            else
            {
                customer.IpAddress = draft.IpAddress;
            }

            var calculation = await _calculations.CreateAsync(new Stripe.Tax.CalculationCreateOptions
            {
                Currency = draft.Currency.ToLowerInvariant(),
                CustomerDetails = customer,
                LineItems = draft.Lines.Select(line => new Stripe.Tax.CalculationLineItemOptions
                {
                    Amount = line.AmountMinor,
                    Quantity = line.Quantity,
                    Reference = line.Reference,
                    TaxBehavior = "inclusive",
                    TaxCode = !string.IsNullOrWhiteSpace(line.TaxCode) ? line.TaxCode : string.IsNullOrWhiteSpace(draft.TaxCode) ? null : draft.TaxCode
                }).ToList()
            });

            // Для показа и заказа берём самую крупную строку разбивки: у ключей игр это одна ставка страны.
            var main = calculation.TaxBreakdown?.OrderByDescending(item => item.Amount).FirstOrDefault();
            return new TaxCalculationSnapshot
            {
                Id = calculation.Id,
                AmountTotalMinor = calculation.AmountTotal,
                TaxInclusiveMinor = calculation.TaxAmountInclusive,
                Country = main?.TaxRateDetails?.Country,
                State = main?.TaxRateDetails?.State,
                TaxType = main?.TaxRateDetails?.TaxType,
                RatePercent = decimal.TryParse(main?.TaxRateDetails?.PercentageDecimal, System.Globalization.NumberStyles.Number,
                    System.Globalization.CultureInfo.InvariantCulture, out var rate) ? rate : null,
                TaxabilityReason = main?.TaxabilityReason,
                ExpiresAt = calculation.ExpiresAt
            };
        }

        public async Task<string> CreateTransactionAsync(string calculationId, string reference, string idempotencyKey)
        {
            var transaction = await _transactions.CreateFromCalculationAsync(
                new Stripe.Tax.TransactionCreateFromCalculationOptions { Calculation = calculationId, Reference = reference },
                new RequestOptions { IdempotencyKey = idempotencyKey });
            return transaction.Id;
        }

        public async Task<string> ReverseTransactionAsync(TaxReversalDraft draft, string idempotencyKey)
        {
            var options = new Stripe.Tax.TransactionCreateReversalOptions
            {
                OriginalTransaction = draft.OriginalTransactionId,
                Reference = draft.Reference,
                Mode = draft.Full ? "full" : "partial",
                FlatAmount = draft.Full ? null : -Math.Abs(draft.AmountMinor)
            };
            var reversal = await _transactions.CreateReversalAsync(options, new RequestOptions { IdempotencyKey = idempotencyKey });
            return reversal.Id;
        }
    }
}
