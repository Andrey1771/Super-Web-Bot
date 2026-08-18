using SuperBot.Core.Entities;
using Xunit;

namespace SuperBot.Tests
{
    /// <summary>
    /// Валютная привязка промокодов. Скидка «минус 10» — это конкретные деньги: применить её
    /// к корзине в другой валюте значит дать не ту скидку, которую обещал маркетинг.
    /// Процент валютно-нейтрален и работает везде.
    /// </summary>
    public class PromoCodeCurrencyTests
    {
        private static PromoCode Percentage(decimal value = 10m, string? currency = null) =>
            new() { Code = "SAVE10", Type = PromoCodeType.Percentage, Value = value, Currency = currency };

        private static PromoCode Fixed(decimal value = 10m, string? currency = null) =>
            new() { Code = "MINUS10", Type = PromoCodeType.Fixed, Value = value, Currency = currency };

        [Fact]
        public void Percentage_withoutThresholds_appliesToAnyCurrency()
        {
            var promo = Percentage();

            Assert.True(promo.AppliesToCurrency("USD"));
            Assert.True(promo.AppliesToCurrency("EUR"));
            Assert.True(promo.AppliesToCurrency("JPY"));
        }

        [Fact]
        public void Percentage_withMinOrderAmount_becomesCurrencyBound()
        {
            // «Скидка 10 % при заказе от 50» — порог тоже деньги, и в другой валюте он другой.
            var promo = Percentage();
            promo.MinOrderAmount = 50m;

            Assert.True(promo.AppliesToCurrency("USD"));
            Assert.False(promo.AppliesToCurrency("EUR"));
        }

        [Fact]
        public void Fixed_withoutCurrency_isTreatedAsCatalogUsd()
        {
            // Промокоды, заведённые до мультивалютности, валюты не имеют — это доллары.
            var promo = Fixed();

            Assert.True(promo.AppliesToCurrency("USD"));
            Assert.False(promo.AppliesToCurrency("EUR"));
        }

        [Fact]
        public void Fixed_withOwnCurrency_appliesOnlyToIt()
        {
            var promo = Fixed(currency: "EUR");

            Assert.True(promo.AppliesToCurrency("EUR"));
            Assert.False(promo.AppliesToCurrency("USD"));
        }

        [Theory]
        [InlineData("eur")]
        [InlineData(" EUR ")]
        public void Fixed_currencyComparisonIgnoresCaseAndSpaces(string cartCurrency)
        {
            Assert.True(Fixed(currency: "EUR").AppliesToCurrency(cartCurrency));
        }

        [Fact]
        public void NoCartCurrency_keepsOldBehaviour()
        {
            // Вызывающие, которые валюту не передают, работают как раньше — без проверки.
            Assert.True(Fixed().AppliesToCurrency(null));
            Assert.True(Fixed().AppliesToCurrency("  "));
        }

        [Fact]
        public void HasAbsoluteAmounts_reflectsWhatIsMoney()
        {
            Assert.False(Percentage().HasAbsoluteAmounts);
            Assert.True(Fixed().HasAbsoluteAmounts);

            var withCap = Percentage();
            withCap.MaxDiscountAmount = 20m;
            Assert.True(withCap.HasAbsoluteAmounts);
        }
    }
}
