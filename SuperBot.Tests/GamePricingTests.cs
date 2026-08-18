using SuperBot.Core.Entities;
using SuperBot.Core.Payments;
using Xunit;

namespace SuperBot.Tests
{
    /// <summary>
    /// Выбор цены по валюте. Главное, что фиксируем: отсутствие цены — это отказ, а не ноль
    /// и не «возьмём базовую». Молчаливый фолбэк на базовую цену означал бы списать 59.99
    /// в валюте, где это совсем другие деньги.
    /// </summary>
    public class GamePricingTests
    {
        private static Game Game(decimal price, string? currency = null, Dictionary<string, decimal>? prices = null) =>
            new() { Id = "1", Name = "Game", Price = price, Currency = currency, Prices = prices };

        [Fact]
        public void BaseCurrency_EmptyCurrency_IsUsd()
        {
            // Записи до мультивалютности: валюты нет, но фактически каталог вёлся в долларах.
            Assert.Equal("USD", GamePricing.BaseCurrency(Game(59.99m)));
            Assert.Equal("USD", GamePricing.BaseCurrency(Game(59.99m, "   ")));
        }

        [Fact]
        public void BaseCurrency_IsNormalizedToUpperCase()
        {
            Assert.Equal("EUR", GamePricing.BaseCurrency(Game(49.99m, "eur")));
        }

        [Fact]
        public void TryGetPrice_BaseCurrency_ReturnsBasePrice()
        {
            var game = Game(59.99m, "USD", new Dictionary<string, decimal> { ["EUR"] = 54.99m });

            Assert.Equal(59.99m, GamePricing.TryGetPrice(game, "USD"));
        }

        [Fact]
        public void TryGetPrice_NoCurrencyRequested_FallsBackToBase()
        {
            Assert.Equal(59.99m, GamePricing.TryGetPrice(Game(59.99m, "USD"), null));
        }

        [Fact]
        public void TryGetPrice_ListedCurrency_ReturnsManualPrice()
        {
            var game = Game(59.99m, "USD", new Dictionary<string, decimal> { ["EUR"] = 54.99m });

            // Ручная цена, а не пересчёт: 54.99 ≠ 59.99 по любому курсу — это решение прайс-листа.
            Assert.Equal(54.99m, GamePricing.TryGetPrice(game, "EUR"));
        }

        [Theory]
        [InlineData("eur")]
        [InlineData(" EUR ")]
        public void TryGetPrice_IgnoresCaseAndSpaces(string requested)
        {
            var game = Game(59.99m, "USD", new Dictionary<string, decimal> { [" eur "] = 54.99m });

            Assert.Equal(54.99m, GamePricing.TryGetPrice(game, requested));
        }

        [Fact]
        public void TryGetPrice_UnlistedCurrency_ReturnsNull()
        {
            var game = Game(59.99m, "USD", new Dictionary<string, decimal> { ["EUR"] = 54.99m });

            // Ни цены, ни курса — значит продавать в этой валюте нельзя.
            Assert.Null(GamePricing.TryGetPrice(game, "JPY"));
        }

        [Fact]
        public void TryGetPrice_NoPriceList_ReturnsNullForOtherCurrency()
        {
            Assert.Null(GamePricing.TryGetPrice(Game(59.99m, "USD"), "EUR"));
        }

        [Fact]
        public void TryGetPrice_ZeroPriceIsAPrice_NotAbsence()
        {
            // Бесплатная игра — это цена 0, а не «цены нет»: отличие важно для вызывающего.
            var game = Game(59.99m, "USD", new Dictionary<string, decimal> { ["EUR"] = 0m });

            Assert.Equal(0m, GamePricing.TryGetPrice(game, "EUR"));
        }

        [Fact]
        public void AvailableCurrencies_IncludesBaseAndPriceList()
        {
            var game = Game(59.99m, "usd", new Dictionary<string, decimal> { ["eur"] = 54.99m, ["JPY"] = 6800m });

            var currencies = GamePricing.AvailableCurrencies(game);

            Assert.Equal(new[] { "USD", "EUR", "JPY" }.OrderBy(code => code), currencies.OrderBy(code => code));
        }

        [Fact]
        public void AvailableCurrencies_BaseListedTwice_IsNotDuplicated()
        {
            var game = Game(59.99m, "USD", new Dictionary<string, decimal> { ["USD"] = 49.99m });

            Assert.Single(GamePricing.AvailableCurrencies(game));
        }
    }
}
