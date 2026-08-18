using SuperBot.Core.Payments;
using Xunit;

namespace SuperBot.Tests
{
    /// <summary>
    /// Перевод в минорные единицы. Фиксируем главное: множитель берётся у валюты, а не
    /// из константы 100 — иначе заказ в JPY или в Telegram Stars уходит в провайдера
    /// в сто раз дороже, чем показала витрина.
    /// </summary>
    public class CurrencyMinorUnitsTests
    {
        [Theory]
        [InlineData("USD", 2)]
        [InlineData("EUR", 2)]
        [InlineData("RUB", 2)]
        [InlineData("JPY", 0)]
        [InlineData("KRW", 0)]
        [InlineData("XTR", 0)]
        [InlineData("KWD", 3)]
        public void Exponent_MatchesCurrency(string currency, int expected)
        {
            Assert.Equal(expected, CurrencyMinorUnits.Exponent(currency));
        }

        [Fact]
        public void Exponent_UnknownOrEmptyCurrency_FallsBackToTwo()
        {
            Assert.Equal(2, CurrencyMinorUnits.Exponent("ZZZ"));
            Assert.Equal(2, CurrencyMinorUnits.Exponent(null));
            Assert.Equal(2, CurrencyMinorUnits.Exponent("   "));
        }

        [Fact]
        public void Exponent_IsCaseInsensitive()
        {
            Assert.Equal(0, CurrencyMinorUnits.Exponent("jpy"));
            Assert.Equal(0, CurrencyMinorUnits.Exponent("xtr"));
        }

        [Theory]
        [InlineData(19.99, "USD", 1999L)]
        [InlineData(0.01, "USD", 1L)]
        [InlineData(1200, "JPY", 1200L)]
        [InlineData(49, "XTR", 49L)]
        [InlineData(1.5, "KWD", 1500L)]
        public void ToMinor_UsesCurrencyFactor(decimal amount, string currency, long expected)
        {
            Assert.Equal(expected, CurrencyMinorUnits.ToMinor(amount, currency));
        }

        [Fact]
        public void ToMinor_ZeroDecimalCurrency_DoesNotInflateAmount()
        {
            // Регрессия: с прибитым «* 100» заказ на 1200 иен уходил как 120 000 иен.
            Assert.Equal(1200L, CurrencyMinorUnits.ToMinor(1200m, "JPY"));
            Assert.NotEqual(120000L, CurrencyMinorUnits.ToMinor(1200m, "JPY"));
        }

        [Fact]
        public void ToMinor_RoundsHalfAwayFromZero()
        {
            // Классическая потеря копейки: банковское округление отдало бы 1234.
            Assert.Equal(1235L, CurrencyMinorUnits.ToMinor(12.345m, "USD"));
        }

        [Fact]
        public void Round_TrimsToCurrencyPrecision()
        {
            Assert.Equal(12.35m, CurrencyMinorUnits.Round(12.345m, "USD"));
            Assert.Equal(1200m, CurrencyMinorUnits.Round(1199.6m, "JPY"));
        }

        [Theory]
        [InlineData(1999L, "USD", 19.99)]
        [InlineData(1200L, "JPY", 1200)]
        [InlineData(1500L, "KWD", 1.5)]
        public void FromMinor_IsInverseOfToMinor(long minor, string currency, decimal expected)
        {
            Assert.Equal(expected, CurrencyMinorUnits.FromMinor(minor, currency));
        }
    }
}
