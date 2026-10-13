using SuperBot.Core.Entities;
using SuperBot.Core.Payments;
using Xunit;

namespace SuperBot.Tests
{
    /// <summary>
    /// Цена по курсу — продолжение <see cref="GamePricingTests"/> для случая, когда руками
    /// цену не завели. Ключевое правило: ручная цена всегда сильнее курса. Её назначил человек,
    /// и «красивый» ценник рынка не должен уезжать вслед за колебаниями.
    /// </summary>
    public class GamePricingFxTests
    {
        private static Game Game(decimal price = 59.99m, Dictionary<string, decimal>? prices = null) =>
            new() { Id = "1", Name = "Game", Price = price, Currency = "USD", Prices = prices };

        private static FxRateBook Rates(decimal eur = 0.90m) =>
            new("USD", new[] { new FxRate("USD", "EUR", eur, DateTime.UtcNow) });

        private static FxOptions Fx(decimal markup = 3m, string rule = "NinetyNine") =>
            new() { MarkupPercent = markup, Rounding = new Dictionary<string, string> { ["EUR"] = rule } };

        [Fact]
        public void ManualPrice_winsOverTheRate()
        {
            var game = Game(prices: new Dictionary<string, decimal> { ["EUR"] = 49.99m });

            Assert.Equal(49.99m, GamePricing.TryGetPrice(game, "EUR", Rates(), Fx()));
        }

        [Fact]
        public void WithoutManualPrice_priceIsConverted()
        {
            // 59.99 × 0.90 = 53.99, +3 % = 55.61, вверх до ценника = 55.99.
            Assert.Equal(55.99m, GamePricing.TryGetPrice(Game(), "EUR", Rates(), Fx()));
        }

        [Fact]
        public void WithoutRate_thereIsStillNoPrice()
        {
            // Курса на эту валюту нет — товар в ней не продаётся, как и до Этапа 4.
            Assert.Null(GamePricing.TryGetPrice(Game(), "JPY", Rates(), Fx()));
        }

        [Fact]
        public void WithoutRateBook_behavesLikeBeforeStageFour()
        {
            Assert.Null(GamePricing.TryGetPrice(Game(), "EUR", rates: null, fx: null));
        }

        [Fact]
        public void BaseCurrency_isNeverConverted()
        {
            // Своя валюта игры берётся как есть: наценка на неё была бы наценкой на пустом месте.
            Assert.Equal(59.99m, GamePricing.TryGetPrice(Game(), "USD", Rates(), Fx()));
        }

        [Fact]
        public void RateBookOfAnotherBaseCurrency_isNotUsed()
        {
            // Курсы считаны от евро, а цена игры в долларах: перемножать их нельзя.
            var foreignBook = new FxRateBook("EUR", new[] { new FxRate("EUR", "PLN", 4.3m, DateTime.UtcNow) });

            Assert.Null(GamePricing.TryGetPrice(Game(), "PLN", foreignBook, Fx()));
        }

        [Fact]
        public void RoundingRuleComesFromConfiguration()
        {
            // Та же цена и курс, другое правило округления — другой ценник.
            var upToHundred = new FxOptions
            {
                MarkupPercent = 0m,
                Rounding = new Dictionary<string, string> { ["EUR"] = "Hundred" }
            };

            Assert.Equal(100m, GamePricing.TryGetPrice(Game(), "EUR", Rates(), upToHundred));
        }

        // ---------- издания ----------

        private static GameEdition Edition(decimal price = 79.99m, Dictionary<string, decimal>? prices = null) =>
            new() { Code = "deluxe", Title = "Deluxe", Price = price, Prices = prices };

        [Fact]
        public void Edition_inBaseCurrency_isItsOwnPrice()
        {
            Assert.Equal(79.99m, GamePricing.TryGetEditionPrice(Edition(), Game(), "USD", Rates(), Fx()));
        }

        [Fact]
        public void Edition_manualPrice_winsOverTheRate()
        {
            var edition = Edition(prices: new Dictionary<string, decimal> { ["EUR"] = 69.99m });
            Assert.Equal(69.99m, GamePricing.TryGetEditionPrice(edition, Game(), "EUR", Rates(), Fx()));
        }

        [Fact]
        public void Edition_withoutManualPrice_isConvertedFromItsOwnBasePrice_notTheGames()
        {
            // 79.99 × 0.90 = 71.99, +3% = 74.15, вверх до .99 → 74.99. Цена игры (59.99) не участвует.
            var game = Game(prices: new Dictionary<string, decimal> { ["EUR"] = 49.99m });
            Assert.Equal(74.99m, GamePricing.TryGetEditionPrice(Edition(), game, "EUR", Rates(), Fx()));
        }

        [Fact]
        public void Edition_withoutRateAndManualPrice_isNotSold()
        {
            Assert.Null(GamePricing.TryGetEditionPrice(Edition(), Game(), "EUR", null, null));
        }
    }
}
