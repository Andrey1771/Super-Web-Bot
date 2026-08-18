using SuperBot.Core.Payments;
using Xunit;

namespace SuperBot.Tests
{
    /// <summary>
    /// Обновление курсов. Главное правило: сомнительный курс не применяется, а прежний остаётся
    /// в силе. Скачок почти всегда означает сбой источника, а применённый автоматически сбой
    /// уводит цены всего каталога — и узнают об этом от покупателей.
    /// </summary>
    public class FxRateBookTests
    {
        private static FxRate Rate(string to, decimal value, DateTime? at = null) =>
            new("USD", to, value, at ?? DateTime.UtcNow);

        [Fact]
        public void BaseCurrency_alwaysConvertsOneToOne()
        {
            var book = new FxRateBook("USD");

            Assert.Equal(1m, book.For("USD")!.Rate);
        }

        [Fact]
        public void UnknownCurrency_hasNoRate()
        {
            Assert.Null(new FxRateBook("USD").For("EUR"));
        }

        [Fact]
        public void FirstRate_isAlwaysAccepted()
        {
            // Сравнивать не с чем — гард не должен блокировать самый первый импорт.
            var book = new FxRateBook("USD");

            var result = book.Offer(Rate("EUR", 0.90m), maxChangePercent: 10m);

            Assert.True(result.Accepted);
            Assert.Equal(0.90m, book.For("EUR")!.Rate);
        }

        [Fact]
        public void SmallMove_isAccepted()
        {
            var book = new FxRateBook("USD", new[] { Rate("EUR", 0.90m) });

            var result = book.Offer(Rate("EUR", 0.93m), maxChangePercent: 10m);

            Assert.True(result.Accepted);
            Assert.Equal(0.93m, book.For("EUR")!.Rate);
        }

        [Fact]
        public void BigJump_isRejectedAndPreviousRateSurvives()
        {
            var book = new FxRateBook("USD", new[] { Rate("EUR", 0.90m) });

            var result = book.Offer(Rate("EUR", 9.0m), maxChangePercent: 10m);

            Assert.False(result.Accepted);
            Assert.Contains("guard", result.Reason);
            // Торгуем по вчерашнему курсу, а не по сломанному.
            Assert.Equal(0.90m, book.For("EUR")!.Rate);
        }

        [Fact]
        public void JumpDownwards_isGuardedToo()
        {
            // Обвал курса так же подозрителен, как и взлёт: цены уедут вниз, а не вверх.
            var book = new FxRateBook("USD", new[] { Rate("EUR", 0.90m) });

            Assert.False(book.Offer(Rate("EUR", 0.09m), maxChangePercent: 10m).Accepted);
        }

        [Fact]
        public void BrokenRate_isRejected()
        {
            var book = new FxRateBook("USD", new[] { Rate("EUR", 0.90m) });

            Assert.False(book.Offer(Rate("EUR", 0m), maxChangePercent: 10m).Accepted);
            Assert.Equal(0.90m, book.For("EUR")!.Rate);
        }

        [Fact]
        public void RejectedUpdate_reportsHowFarItMoved()
        {
            var book = new FxRateBook("USD", new[] { Rate("EUR", 1.0m) });

            var result = book.Offer(Rate("EUR", 1.5m), maxChangePercent: 10m);

            // Величина нужна алерту: «курс уехал на 50 %» понятнее, чем «курс отклонён».
            Assert.Equal(50m, result.ChangePercent);
        }

        [Fact]
        public void KnownRates_canBeSnapshotted()
        {
            var book = new FxRateBook("USD", new[] { Rate("EUR", 0.9m), Rate("JPY", 150m) });

            Assert.Equal(2, book.All().Count);
        }
    }
}
