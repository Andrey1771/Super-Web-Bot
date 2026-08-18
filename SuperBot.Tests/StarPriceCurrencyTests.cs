using SuperBot.Core.Payments;
using Xunit;

namespace SuperBot.Tests
{
    /// <summary>
    /// Цена в Telegram Stars при мультивалютном каталоге. Раньше в пересчёт приходила
    /// <c>game.Price</c> как «просто число», и цена игры в евро считалась по долларовой ставке —
    /// покупатель платил звёздами примерно на 8 % меньше, и заметить это было негде.
    /// </summary>
    public class StarPriceCurrencyTests
    {
        private static FxRateBook UsdBook(decimal eur = 0.90m) =>
            new("USD", new[] { new FxRate("USD", "EUR", eur, DateTime.UtcNow) });

        [Fact]
        public void UsdAmount_needsNoRates()
        {
            Assert.Equal(500, StarPrice.FromAmount(10m, "USD", rates: null, starsPerUsd: 50));
        }

        [Fact]
        public void EmptyCurrency_isTreatedAsUsd()
        {
            // Игры, заведённые до мультивалютности, валюты не имеют — это доллары.
            Assert.Equal(500, StarPrice.FromAmount(10m, null, rates: null, starsPerUsd: 50));
        }

        [Fact]
        public void OtherCurrency_isNormalizedToUsdFirst()
        {
            // 9 € при курсе 0.90 = 10 $ = 500 звёзд. Без нормализации получилось бы 450.
            Assert.Equal(500, StarPrice.FromAmount(9m, "EUR", UsdBook(), starsPerUsd: 50));
        }

        [Fact]
        public void OtherCurrencyWithoutRates_isNotSoldForStars()
        {
            // Пересчитать нечем — лучше не предлагать звёзды, чем взять не ту сумму.
            Assert.Null(StarPrice.FromAmount(9m, "EUR", rates: null, starsPerUsd: 50));
        }

        [Fact]
        public void UnknownCurrency_isNotSoldForStars()
        {
            Assert.Null(StarPrice.FromAmount(1000m, "JPY", UsdBook(), starsPerUsd: 50));
        }

        [Fact]
        public void ChainedConversion_isRefusedRatherThanApproximated()
        {
            // Курсы от евро, сумма в злотых: две конверсии подряд копят погрешность,
            // а цена в звёздах и так демонстрационная — отказываемся.
            var euroBook = new FxRateBook("EUR", new[] { new FxRate("EUR", "PLN", 4.3m, DateTime.UtcNow) });

            Assert.Null(StarPrice.FromAmount(43m, "PLN", euroBook, starsPerUsd: 50));
        }

        [Fact]
        public void RateBookOfAnotherBase_stillConvertsItsOwnCurrency()
        {
            // Каталог ведётся в евро, курс к доллару известен — этого достаточно.
            var euroBook = new FxRateBook("EUR", new[] { new FxRate("EUR", "USD", 1.1m, DateTime.UtcNow) });

            Assert.Equal(550, StarPrice.FromAmount(10m, "EUR", euroBook, starsPerUsd: 50));
        }

        [Fact]
        public void MinimumIsOneStar()
        {
            // Telegram не принимает нулевой платёж.
            Assert.Equal(1, StarPrice.FromAmount(0.001m, "USD", null, starsPerUsd: 50));
        }
    }
}
