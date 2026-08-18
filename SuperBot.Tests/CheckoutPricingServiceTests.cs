using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Payments;
using SuperBot.Infrastructure.Services;
using Xunit;

namespace SuperBot.Tests
{
    /// <summary>
    /// Ценообразование чекаута — слой, где жила дыра «цена приходит от клиента».
    /// Эти тесты фиксируют главное правило: сумму к списанию определяет ТОЛЬКО каталог.
    /// </summary>
    public class CheckoutPricingServiceTests
    {
        private const string GameId = "game-1";

        private static CheckoutPricingService Build(
            IEnumerable<Game>? games = null,
            IEnumerable<GameDiscount>? discounts = null,
            PromoValidationResult? promo = null,
            StorefrontCurrencyOptions? currencies = null,
            FxOptions? fx = null)
        {
            var currencyOptions = currencies ?? new StorefrontCurrencyOptions();
            var fxOptions = fx ?? new FxOptions();

            return new CheckoutPricingService(
                new FakeGameRepository(games ?? new[] { Game(60m) }),
                new FakeGameDiscountRepository(discounts ?? Array.Empty<GameDiscount>()),
                new FakePromoCodeService(promo),
                Options.Create(currencyOptions),
                new FxRateService(
                    Options.Create(currencyOptions),
                    Options.Create(fxOptions),
                    NullLogger<FxRateService>.Instance),
                Options.Create(fxOptions),
                NullLogger<CheckoutPricingService>.Instance);
        }

        private static Game Game(decimal price, string id = GameId) => new()
        {
            Id = id,
            Name = "Test Game",
            Title = "Test Game",
            Price = price,
            ImagePath = "cover.png"
        };

        private static CheckoutPricingRequest Cart(
            int quantity = 1,
            string gameId = GameId,
            string? promo = null,
            string? currency = null) => new()
        {
            Items = new List<CheckoutPricingItem> { new() { GameId = gameId, Quantity = quantity } },
            PromoCode = promo,
            UserName = "user-1",
            Currency = currency
        };

        [Fact]
        public async Task Uses_catalog_price_not_anything_from_the_request()
        {
            var result = await Build(new[] { Game(59.99m) }).PriceAsync(Cart());

            Assert.True(result.Success);
            var line = Assert.Single(result.Items);
            Assert.Equal(59.99m, line.UnitPrice);
            Assert.Equal(59.99m, result.Total);
        }

        [Fact]
        public async Task Charges_in_minor_units_without_losing_cents()
        {
            // Именно здесь раньше терялись копейки: $19.99 списывались как $20.00.
            var result = await Build(new[] { Game(19.99m) }).PriceAsync(Cart());

            Assert.Equal(1999, result.AmountMinorUnits);
        }

        [Fact]
        public async Task Currency_is_always_the_server_settlement_currency()
        {
            // Клиент не может выбрать валюту: иначе «60» списалось бы в рупиях вместо долларов.
            var result = await Build().PriceAsync(Cart());

            Assert.Equal(CheckoutPricingService.SettlementCurrency, result.Currency);
            Assert.Equal(CheckoutPricingService.SettlementCurrency, Assert.Single(result.Items).Currency);
        }

        [Fact]
        public async Task Applies_active_discount()
        {
            var discount = new GameDiscount
            {
                GameId = GameId,
                DiscountPercent = 25m,
                StartDate = DateTime.UtcNow.AddDays(-1),
                EndDate = DateTime.UtcNow.AddDays(1)
            };

            var result = await Build(new[] { Game(60m) }, new[] { discount }).PriceAsync(Cart());

            var line = Assert.Single(result.Items);
            Assert.Equal(60m, line.UnitPrice);
            Assert.Equal(45m, line.FinalUnitPrice);
            Assert.Equal(45m, result.Total);
            Assert.Equal(4500, result.AmountMinorUnits);
        }

        [Fact]
        public async Task Ignores_expired_discount()
        {
            var expired = new GameDiscount
            {
                GameId = GameId,
                DiscountPercent = 90m,
                StartDate = DateTime.UtcNow.AddDays(-10),
                EndDate = DateTime.UtcNow.AddDays(-5)
            };

            var result = await Build(new[] { Game(60m) }, new[] { expired }).PriceAsync(Cart());

            Assert.Equal(60m, result.Total);
        }

        [Fact]
        public async Task Multiplies_by_quantity()
        {
            var result = await Build(new[] { Game(10m) }).PriceAsync(Cart(quantity: 3));

            Assert.Equal(30m, result.Total);
            Assert.Equal(3000, result.AmountMinorUnits);
        }

        [Fact]
        public async Task Rejects_unknown_game_instead_of_charging_for_it()
        {
            var result = await Build(Array.Empty<Game>()).PriceAsync(Cart());

            Assert.False(result.Success);
            Assert.Equal(0, result.AmountMinorUnits);
        }

        [Fact]
        public async Task Rejects_empty_cart()
        {
            var result = await Build().PriceAsync(new CheckoutPricingRequest());

            Assert.False(result.Success);
        }

        [Theory]
        [InlineData(0)]
        [InlineData(-5)]
        [InlineData(11)]
        public async Task Rejects_invalid_quantity(int quantity)
        {
            var result = await Build().PriceAsync(Cart(quantity: quantity));

            Assert.False(result.Success);
        }

        [Fact]
        public async Task Collapses_duplicate_game_ids_so_quantity_limit_cannot_be_bypassed()
        {
            // Шесть строк по 5 штук — это 30 копий одной игры в обход лимита.
            var request = new CheckoutPricingRequest
            {
                Items = Enumerable.Range(0, 6)
                    .Select(_ => new CheckoutPricingItem { GameId = GameId, Quantity = 5 })
                    .ToList(),
                UserName = "user-1"
            };

            var result = await Build().PriceAsync(request);

            Assert.False(result.Success);
        }

        [Fact]
        public async Task Applies_valid_promo_code()
        {
            var promo = new PromoValidationResult
            {
                Valid = true,
                DiscountAmount = 10m,
                NormalizedCode = "SAVE10",
                Message = "ok"
            };

            var result = await Build(new[] { Game(60m) }, promo: promo).PriceAsync(Cart(promo: "save10"));

            Assert.True(result.PromoApplied);
            Assert.Equal("SAVE10", result.NormalizedPromoCode);
            Assert.Equal(50m, result.Total);
        }

        [Fact]
        public async Task Ignores_invalid_promo_code()
        {
            var promo = new PromoValidationResult { Valid = false, DiscountAmount = 50m, Message = "nope" };

            var result = await Build(new[] { Game(60m) }, promo: promo).PriceAsync(Cart(promo: "bad"));

            Assert.False(result.PromoApplied);
            Assert.Equal(60m, result.Total);
        }

        [Fact]
        public async Task Promo_discount_cannot_exceed_cart_and_cannot_make_total_negative()
        {
            // Промокод на $500 при корзине в $60 не должен уводить сумму в минус.
            var promo = new PromoValidationResult { Valid = true, DiscountAmount = 500m, NormalizedCode = "HUGE" };

            var result = await Build(new[] { Game(60m) }, promo: promo).PriceAsync(Cart(promo: "huge"));

            // Сумма схлопнулась в ноль — платить нечего, заказ отклоняется, а не создаётся бесплатным.
            Assert.False(result.Success);
        }

        [Fact]
        public async Task Free_game_is_rejected_rather_than_charged_zero()
        {
            var result = await Build(new[] { Game(0m) }).PriceAsync(Cart());

            Assert.False(result.Success);
        }

        [Fact]
        public async Task Rejects_game_that_is_not_released_yet()
        {
            // Невышедшая игра видна на витрине, но прайсинг — общий вход всех оплат — её не пропускает.
            var upcoming = Game(60m);
            upcoming.ReleaseDate = DateTime.UtcNow.AddDays(7);

            var result = await Build(new[] { upcoming }).PriceAsync(Cart());

            Assert.False(result.Success);
            Assert.Contains("isn't released yet", result.Error);
        }

        [Fact]
        public async Task Released_game_with_past_release_date_is_purchasable()
        {
            var released = Game(60m);
            released.ReleaseDate = DateTime.UtcNow.AddYears(-1);

            var result = await Build(new[] { released }).PriceAsync(Cart());

            Assert.True(result.Success);
        }

        // ---------- мультивалютность ----------

        private static StorefrontCurrencyOptions Currencies(params string[] supported) =>
            new() { BaseCurrency = "USD", SupportedCurrencies = supported.ToList() };

        private static Game GameWithPrices(decimal basePrice, Dictionary<string, decimal> prices)
        {
            var game = Game(basePrice);
            game.Currency = "USD";
            game.Prices = prices;
            return game;
        }

        [Fact]
        public async Task Uses_price_from_the_price_list_for_the_requested_currency()
        {
            var game = GameWithPrices(59.99m, new Dictionary<string, decimal> { ["EUR"] = 54.99m });

            var result = await Build(new[] { game }, currencies: Currencies("EUR"))
                .PriceAsync(Cart(currency: "EUR"));

            Assert.True(result.Success);
            Assert.Equal("EUR", result.Currency);
            // Ручная цена, а не пересчёт базовой: 54.99 назначена прайс-листом.
            Assert.Equal(54.99m, result.Total);
            Assert.Equal(5499, result.AmountMinorUnits);
        }

        [Fact]
        public async Task Rejects_checkout_when_game_has_no_price_in_the_requested_currency()
        {
            // Валюта витриной поддержана, но у конкретной игры цены в ней нет.
            // Отказ — единственный честный исход: подставить базовую значило бы списать
            // 59.99 евро вместо долларов.
            var game = GameWithPrices(59.99m, new Dictionary<string, decimal>());

            var result = await Build(new[] { game }, currencies: Currencies("EUR"))
                .PriceAsync(Cart(currency: "EUR"));

            Assert.False(result.Success);
            Assert.Contains("EUR", result.Error);
        }

        [Fact]
        public async Task Unsupported_currency_falls_back_to_base_rather_than_failing()
        {
            // Кривой ?currency= в запросе не должен ломать оплату — считаем в базовой.
            var result = await Build(new[] { Game(59.99m) }, currencies: Currencies())
                .PriceAsync(Cart(currency: "ZZZ"));

            Assert.True(result.Success);
            Assert.Equal("USD", result.Currency);
        }

        [Fact]
        public async Task Requested_currency_reaches_the_promo_service()
        {
            // Промокод на фиксированную сумму обязан знать валюту корзины, иначе «минус 10»
            // применится к любой валюте как своё.
            var promoService = new FakePromoCodeService(new PromoValidationResult { Valid = false, Message = "no" });
            var game = GameWithPrices(59.99m, new Dictionary<string, decimal> { ["EUR"] = 54.99m });

            var currencyOptions = Currencies("EUR");
            var fxOptions = new FxOptions();
            var service = new CheckoutPricingService(
                new FakeGameRepository(new[] { game }),
                new FakeGameDiscountRepository(Array.Empty<GameDiscount>()),
                promoService,
                Options.Create(currencyOptions),
                new FxRateService(
                    Options.Create(currencyOptions),
                    Options.Create(fxOptions),
                    NullLogger<FxRateService>.Instance),
                Options.Create(fxOptions),
                NullLogger<CheckoutPricingService>.Instance);

            await service.PriceAsync(Cart(promo: "save10", currency: "EUR"));

            Assert.Equal("EUR", promoService.LastRequest?.Currency);
        }

        private sealed class FakeGameRepository : IGameRepository
        {
            private readonly List<Game> _games;
            public FakeGameRepository(IEnumerable<Game> games) => _games = games.ToList();

            public Task<List<Game>> GetByIdsAsync(IEnumerable<string> ids)
            {
                var set = ids.ToHashSet(StringComparer.OrdinalIgnoreCase);
                return Task.FromResult(_games.Where(g => g.Id != null && set.Contains(g.Id)).ToList());
            }

            public Task<List<Game>> GetAllAsync() => Task.FromResult(_games);
            public Task<Game> GetByIdAsync(string id) => Task.FromResult(_games.FirstOrDefault(g => g.Id == id)!);
            public Task<Game> GetByExternalIdAsync(string externalId) => Task.FromResult<Game>(null!);
            public Task<Game> GetBySlugAsync(string slug) => Task.FromResult<Game>(null!);
            public Task<List<Game>> GetByCoverMediaIdAsync(string mediaId) => Task.FromResult(new List<Game>());
            public Task CreateAsync(Game game) => Task.CompletedTask;
            public Task UpdateAsync(string id, Game updatedGame) => Task.CompletedTask;
            public Task DeleteAsync(string id) => Task.CompletedTask;
        }

        private sealed class FakeGameDiscountRepository : IGameDiscountRepository
        {
            private readonly List<GameDiscount> _discounts;
            public FakeGameDiscountRepository(IEnumerable<GameDiscount> discounts) => _discounts = discounts.ToList();

            public Task<List<GameDiscount>> GetByGameIdsAsync(IEnumerable<string> gameIds)
            {
                var set = gameIds.ToHashSet(StringComparer.OrdinalIgnoreCase);
                return Task.FromResult(_discounts.Where(d => set.Contains(d.GameId)).ToList());
            }

            public Task<GameDiscount?> GetByGameIdAsync(string gameId) =>
                Task.FromResult(_discounts.FirstOrDefault(d => d.GameId == gameId));

            public Task UpsertAsync(GameDiscount discount) => Task.CompletedTask;
            public Task DeleteByGameIdAsync(string gameId) => Task.CompletedTask;
        }

        private sealed class FakePromoCodeService : IPromoCodeService
        {
            private readonly PromoValidationResult? _result;
            public FakePromoCodeService(PromoValidationResult? result) => _result = result;

            /// <summary>Последний запрос — чтобы проверить, что валюта корзины доехала до промокода.</summary>
            public PromoValidationRequest? LastRequest { get; private set; }

            public Task<PromoValidationResult> ValidateAsync(PromoValidationRequest request)
            {
                LastRequest = request;
                return Task.FromResult(_result ?? new PromoValidationResult { Valid = false, Message = "not configured" });
            }

            public Task RecordUsageAsync(PromoApplyRequest request) => Task.CompletedTask;
        }
    }
}
