using SuperBot.Core.Payments;
using Xunit;

namespace SuperBot.Tests
{
    /// <summary>
    /// Список валют витрины. Главное, что фиксируем: базовая валюта есть всегда, а запрошенная
    /// извне валюта не может протащить себя в расчёт мимо списка — иначе достаточно было бы
    /// дописать ?currency= в адрес, чтобы увидеть цену в валюте, в которой её никто не назначал.
    /// </summary>
    public class StorefrontCurrencyOptionsTests
    {
        [Fact]
        public void Base_EmptyConfiguration_FallsBackToUsd()
        {
            var options = new StorefrontCurrencyOptions { BaseCurrency = "  " };

            Assert.Equal("USD", options.Base);
        }

        [Fact]
        public void Supported_AlwaysContainsBaseFirst()
        {
            var options = new StorefrontCurrencyOptions
            {
                BaseCurrency = "usd",
                SupportedCurrencies = new List<string> { "eur" }
            };

            Assert.Equal(new[] { "USD", "EUR" }, options.Supported());
        }

        [Fact]
        public void Supported_BaseListedTwice_IsNotDuplicated()
        {
            var options = new StorefrontCurrencyOptions
            {
                BaseCurrency = "USD",
                SupportedCurrencies = new List<string> { "USD", "usd", "EUR" }
            };

            Assert.Equal(new[] { "USD", "EUR" }, options.Supported());
        }

        [Fact]
        public void Supported_IgnoresBlankEntries()
        {
            var options = new StorefrontCurrencyOptions
            {
                BaseCurrency = "USD",
                SupportedCurrencies = new List<string> { "", "   ", "EUR" }
            };

            Assert.Equal(new[] { "USD", "EUR" }, options.Supported());
        }

        [Theory]
        [InlineData("EUR", "EUR")]
        [InlineData("eur", "EUR")]
        [InlineData(" eur ", "EUR")]
        public void Resolve_SupportedCurrency_IsNormalized(string requested, string expected)
        {
            var options = new StorefrontCurrencyOptions
            {
                BaseCurrency = "USD",
                SupportedCurrencies = new List<string> { "EUR" }
            };

            Assert.Equal(expected, options.Resolve(requested));
        }

        [Theory]
        [InlineData("JPY")]
        [InlineData("ZZZ")]
        [InlineData(null)]
        [InlineData("")]
        public void Resolve_UnsupportedOrMissing_FallsBackToBase(string? requested)
        {
            var options = new StorefrontCurrencyOptions
            {
                BaseCurrency = "USD",
                SupportedCurrencies = new List<string> { "EUR" }
            };

            Assert.Equal("USD", options.Resolve(requested));
        }
    }
}
