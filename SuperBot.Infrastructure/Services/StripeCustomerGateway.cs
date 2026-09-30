using Stripe;

namespace SuperBot.Infrastructure.Services
{
    /// <summary>
    /// Единственное место, где код обращается к Stripe за клиентом и его картами.
    ///
    /// Нужен как шов, по образцу <see cref="IStripePaymentIntentGateway"/>: раньше кабинет
    /// создавал сервисы Stripe прямо в конструкторе контроллера, и ни создание клиента, ни
    /// проверку принадлежности карты нельзя было проверить тестом без сети. Наружу отдаёт
    /// свои DTO, а не типы SDK.
    /// </summary>
    public interface IStripeCustomerGateway
    {
        /// <summary>
        /// Заводит клиента. <paramref name="idempotencyKey"/> ОБЯЗАН быть детерминированным
        /// (от id пользователя): если ответ Stripe потерялся или запись в базу не прошла,
        /// повтор должен вернуть того же клиента, а не завести второго.
        /// </summary>
        Task<string> CreateCustomerAsync(string? email, string? name, string idempotencyKey);

        /// <summary>Карта, назначенная клиенту по умолчанию; null — если её нет или клиента нет.</summary>
        Task<string?> GetDefaultPaymentMethodIdAsync(string customerId);

        Task<IReadOnlyList<StripeCardSnapshot>> ListCardsAsync(string customerId);

        /// <summary>Карта по её идентификатору; null — если такой нет. Нужна, чтобы проверить владельца.</summary>
        Task<StripeCardSnapshot?> GetCardAsync(string paymentMethodId);

        Task DetachCardAsync(string paymentMethodId);

        Task SetDefaultCardAsync(string customerId, string? paymentMethodId);

        /// <summary>Намерение привязать карту. Возвращает client_secret для Stripe.js.</summary>
        Task<string?> CreateSetupIntentAsync(string customerId);

        /// <summary>
        /// Короткоживущий ключ сессии покупателя для формы карты на кассе. С ним Payment Element показывает
        /// сохранённые карты покупателя и галочку «сохранить эту карту» (по умолчанию снята); отмеченная галочка
        /// сохраняет карту для оплат с участием покупателя (on_session) — списаний без него не будет.
        /// </summary>
        Task<string?> CreateCheckoutSessionSecretAsync(string customerId);
    }

    /// <summary>Снимок карты — ровно те поля, которые нужны кабинету.</summary>
    public class StripeCardSnapshot
    {
        public string Id { get; set; } = string.Empty;

        /// <summary>Кому карта принадлежит. По нему проверяется, что удаляют свою, а не чужую.</summary>
        public string? CustomerId { get; set; }

        public string Brand { get; set; } = "Card";
        public string Last4 { get; set; } = string.Empty;
        public long ExpMonth { get; set; }
        public long ExpYear { get; set; }
    }

    public class StripeCustomerGateway : IStripeCustomerGateway
    {
        private readonly CustomerService _customers = new();
        private readonly PaymentMethodService _paymentMethods = new();
        private readonly SetupIntentService _setupIntents = new();
        private readonly CustomerSessionService _customerSessions = new();

        public async Task<string> CreateCustomerAsync(string? email, string? name, string idempotencyKey)
        {
            var customer = await _customers.CreateAsync(
                new CustomerCreateOptions { Email = email, Name = name },
                string.IsNullOrWhiteSpace(idempotencyKey)
                    ? null
                    : new RequestOptions { IdempotencyKey = idempotencyKey });

            return customer.Id;
        }

        public async Task<string?> GetDefaultPaymentMethodIdAsync(string customerId)
        {
            var customer = await _customers.GetAsync(customerId);
            return customer?.InvoiceSettings?.DefaultPaymentMethodId;
        }

        public async Task<IReadOnlyList<StripeCardSnapshot>> ListCardsAsync(string customerId)
        {
            var methods = await _paymentMethods.ListAsync(new PaymentMethodListOptions
            {
                Customer = customerId,
                Type = "card"
            });

            return methods.Data.Select(Map).ToList();
        }

        public async Task<StripeCardSnapshot?> GetCardAsync(string paymentMethodId)
        {
            try
            {
                var method = await _paymentMethods.GetAsync(paymentMethodId);
                return method == null ? null : Map(method);
            }
            catch (StripeException exception) when (exception.StripeError?.Code == "resource_missing")
            {
                // Карты с таким идентификатором нет — для вызывающего это то же самое, что
                // «не ваша»: он в обоих случаях отвечает 404 и не рассказывает лишнего.
                return null;
            }
        }

        public Task DetachCardAsync(string paymentMethodId) =>
            _paymentMethods.DetachAsync(paymentMethodId);

        public Task SetDefaultCardAsync(string customerId, string? paymentMethodId) =>
            _customers.UpdateAsync(customerId, new CustomerUpdateOptions
            {
                InvoiceSettings = new CustomerInvoiceSettingsOptions
                {
                    DefaultPaymentMethod = paymentMethodId
                }
            });

        public async Task<string?> CreateSetupIntentAsync(string customerId)
        {
            var intent = await _setupIntents.CreateAsync(new SetupIntentCreateOptions
            {
                Customer = customerId,
                PaymentMethodTypes = new List<string> { "card" },
                Usage = "off_session"
            });

            return intent.ClientSecret;
        }

        public async Task<string?> CreateCheckoutSessionSecretAsync(string customerId)
        {
            var session = await _customerSessions.CreateAsync(CheckoutSessionOptions(customerId));
            return session.ClientSecret;
        }

        /// <summary>Что разрешено форме карты на кассе для этого покупателя. Отдельно — ради теста без Stripe.</summary>
        public static CustomerSessionCreateOptions CheckoutSessionOptions(string customerId) => new()
        {
            Customer = customerId,
            Components = new CustomerSessionComponentsOptions
            {
                PaymentElement = new CustomerSessionComponentsPaymentElementOptions
                {
                    Enabled = true,
                    Features = new CustomerSessionComponentsPaymentElementFeaturesOptions
                    {
                        PaymentMethodRedisplay = "enabled",
                        // Карты из кабинета (Billing → Add method) привязываются через confirmCardSetup, и Stripe помечает
                        // их allow_redisplay = unspecified; фильтр по умолчанию показывает только "always", и такие карты
                        // на кассе не появлялись. Покупатель добавил их сам и явно — показываем и их.
                        PaymentMethodAllowRedisplayFilters = new List<string> { "always", "unspecified" },
                        PaymentMethodSave = "enabled",
                        PaymentMethodSaveUsage = "on_session",
                        // Удаление карт — в кабинете (Billing), касса только платит.
                        PaymentMethodRemove = "disabled"
                    }
                }
            }
        };

        private static StripeCardSnapshot Map(PaymentMethod method) => new()
        {
            Id = method.Id,
            CustomerId = method.CustomerId,
            Brand = method.Card?.Brand ?? "Card",
            Last4 = method.Card?.Last4 ?? string.Empty,
            ExpMonth = method.Card?.ExpMonth ?? 0,
            ExpYear = method.Card?.ExpYear ?? 0
        };
    }
}
