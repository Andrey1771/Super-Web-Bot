using SuperBot.Core.Payments;
using Xunit;

namespace SuperBot.Tests
{
    /// <summary>
    /// Матрица «валюта → способы оплаты». Главное, что здесь фиксируется: покупатель не должен
    /// дойти до чекаута в валюте, которую не примет ни один провайдер. Показать цену можно
    /// в чём угодно, а списать — только тем, что умеет рельс.
    /// </summary>
    public class PaymentMethodAvailabilityTests
    {
        private static readonly PaymentMethod[] AllRails =
        {
            PaymentMethod.Card, PaymentMethod.Crypto, PaymentMethod.TelegramStars, PaymentMethod.YooKassa
        };

        private static IReadOnlyList<PaymentMethodOption> For(
            string currency,
            string baseCurrency = "USD",
            PaymentMethod[]? enabled = null,
            string[]? cardCurrencies = null) =>
            PaymentMethodAvailability.For(currency, baseCurrency, enabled ?? AllRails, cardCurrencies);

        private static bool IsAvailable(IReadOnlyList<PaymentMethodOption> options, PaymentMethod method) =>
            options.Single(option => option.Method == method).Available;

        [Fact]
        public void DisabledRails_areNotOfferedAtAll()
        {
            // Ключи не настроены — рельса не существует, и в списке ему делать нечего:
            // «недоступно, потому что не настроено» покупателю ничего не объясняет.
            var options = For("USD", enabled: new[] { PaymentMethod.Card });

            Assert.Equal(PaymentMethod.Card, Assert.Single(options).Method);
        }

        [Fact]
        public void BaseCurrency_cardAndCryptoWork()
        {
            var options = For("USD");

            Assert.True(IsAvailable(options, PaymentMethod.Card));
            Assert.True(IsAvailable(options, PaymentMethod.Crypto));
        }

        [Fact]
        public void NonBaseCurrency_cryptoIsUnavailableUntilRatesExist()
        {
            // Инвойс BTCPay выставляется в базовой валюте; пересчитать евро в доллары
            // пока нечем — курсы это Этап 4.
            var options = For("EUR");

            Assert.False(IsAvailable(options, PaymentMethod.Crypto));
            Assert.Contains("USD", options.Single(o => o.Method == PaymentMethod.Crypto).Reason);
        }

        [Fact]
        public void Cards_haveNoCurrencyLimitUnlessConfigured()
        {
            // Список валют аккаунта знает только Stripe. Пустой список — не запрещаем ничего.
            Assert.True(IsAvailable(For("EUR"), PaymentMethod.Card));
            Assert.True(IsAvailable(For("JPY"), PaymentMethod.Card));
        }

        [Fact]
        public void Cards_respectConfiguredCurrencyList()
        {
            Assert.True(IsAvailable(For("EUR", cardCurrencies: new[] { "USD", "EUR" }), PaymentMethod.Card));
            Assert.False(IsAvailable(For("JPY", cardCurrencies: new[] { "USD", "EUR" }), PaymentMethod.Card));
        }

        [Fact]
        public void YooKassa_takesRublesOnly()
        {
            Assert.True(IsAvailable(For("RUB"), PaymentMethod.YooKassa));
            Assert.False(IsAvailable(For("USD"), PaymentMethod.YooKassa));
        }

        [Fact]
        public void TelegramStars_areNotAWebCurrency()
        {
            // Звёзды — валюта Telegram: товар в них оценивается пересчётом, а не выбором покупателя.
            Assert.False(IsAvailable(For("USD"), PaymentMethod.TelegramStars));
            Assert.True(IsAvailable(For("XTR"), PaymentMethod.TelegramStars));
        }

        [Theory]
        [InlineData("eur")]
        [InlineData(" EUR ")]
        public void CurrencyComparison_ignoresCaseAndSpaces(string currency)
        {
            Assert.True(IsAvailable(For(currency, cardCurrencies: new[] { "EUR" }), PaymentMethod.Card));
        }

        [Fact]
        public void AnyAvailable_tellsWhetherCurrencyIsSellableAtAll()
        {
            // Валюта, в которой не принимает ни один рельс, показываться не должна.
            var noRailTakesIt = For("JPY", enabled: new[] { PaymentMethod.Crypto, PaymentMethod.YooKassa });
            Assert.False(PaymentMethodAvailability.AnyAvailable(noRailTakesIt));

            Assert.True(PaymentMethodAvailability.AnyAvailable(For("USD")));
        }
    }
}
