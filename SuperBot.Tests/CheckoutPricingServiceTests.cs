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
            FxOptions? fx = null,
            IEnumerable<GameDetails>? details = null)
        {
            var currencyOptions = currencies ?? new StorefrontCurrencyOptions();
            var fxOptions = fx ?? new FxOptions();

            return new CheckoutPricingService(
                new FakeGameRepository(games ?? new[] { Game(60m) }),
                new FakeGameDetailsRepository(details ?? Array.Empty<GameDetails>()),
                new FakeGameDiscountRepository(discounts ?? Array.Empty<GameDiscount>()),
                new FakePromoCodeService(promo),
                Options.Create(currencyOptions),
                new FxRateService(
                    Options.Create(currencyOptions),
                    TestOptions.Of(fxOptions),
                    NullLogger<FxRateService>.Instance),
                TestOptions.Of(fxOptions),
                new SuperBot.Core.Regions.DefaultRegionCatalogProvider(),
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
                new FakeGameDetailsRepository(Array.Empty<GameDetails>()),
                new FakeGameDiscountRepository(Array.Empty<GameDiscount>()),
                promoService,
                Options.Create(currencyOptions),
                new FxRateService(
                    Options.Create(currencyOptions),
                    TestOptions.Of(fxOptions),
                    NullLogger<FxRateService>.Instance),
                TestOptions.Of(fxOptions),
                new SuperBot.Core.Regions.DefaultRegionCatalogProvider(),
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

            public Task<List<Game>> GetWithRegionSettingsAsync() =>
                Task.FromResult(_games.Where(g => g.RegionPolicy is not null || g.RegionPrices is not null).ToList());
            public Task<Game> GetByIdAsync(string id) => Task.FromResult(_games.FirstOrDefault(g => g.Id == id)!);
            public Task<Game> GetByExternalIdAsync(string externalId) => Task.FromResult<Game>(null!);
            public Task<Game> GetBySlugAsync(string slug) => Task.FromResult<Game>(null!);
            public Task<List<Game>> GetByCoverMediaIdAsync(string mediaId) => Task.FromResult(new List<Game>());

            // Постраничная выборка в этих тестах не используется: они проверяют расчёт цен,
            // а не листание каталога. Отдаём весь набор, чтобы фейк отвечал интерфейсу.
            public Task<(List<Game> Items, long Total)> GetPageAsync(
                string? search,
                IReadOnlyCollection<string>? onlyIds,
                IReadOnlyCollection<string>? excludeIds,
                string sortBy,
                bool descending,
                int skip,
                int take,
                bool onlyWithManualPrices = false) => Task.FromResult((_games.Skip(skip).Take(take).ToList(), (long)_games.Count));

            public Task CreateAsync(Game game) => Task.CompletedTask;
            public Task UpdateAsync(string id, Game updatedGame) => Task.CompletedTask;
            public Task DeleteAsync(string id) => Task.CompletedTask;
        }

        private sealed class FakeGameDetailsRepository : IGameDetailsRepository
        {
            public Task DeleteByGameIdAsync(string gameId) => Task.CompletedTask;
            private readonly List<GameDetails> _details;
            public FakeGameDetailsRepository(IEnumerable<GameDetails> details) => _details = details.ToList();
            public Task<GameDetails> GetByGameIdAsync(string gameId) => Task.FromResult(_details.FirstOrDefault(d => d.GameId == gameId)!);
            public Task<List<GameDetails>> GetByGameIdsAsync(IEnumerable<string> gameIds) { var set = gameIds.ToHashSet(); return Task.FromResult(_details.Where(d => d.GameId != null && set.Contains(d.GameId)).ToList()); }
            public Task<GameDetails> GetBySlugAsync(string slug) => Task.FromResult(_details.FirstOrDefault(d => d.Slug == slug)!);
            public Task CreateAsync(GameDetails details) => Task.CompletedTask;
            public Task UpsertAsync(GameDetails details) => Task.CompletedTask;
            public Task UpdateAsync(string id, GameDetails details) => Task.CompletedTask;
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

            public Task<List<GameDiscount>> GetAllAsync() => Task.FromResult(_discounts.ToList());

            // Админский список каталога этим тестам не нужен: они про расчёт цены корзины.
            public Task<(List<GameDiscountRow> Items, long Total)> GetCatalogPageAsync(
                string? search,
                string status,
                string sortBy,
                bool descending,
                int skip,
                int take,
                DateTime now) => Task.FromResult((new List<GameDiscountRow>(), 0L));

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

            public Task<bool> RecordRedemptionAsync(string code, string userName, string orderId) => Task.FromResult(false);
        }
        // ---------- издания ----------

        private static GameDetails DetailsWithEditions(string gameId = GameId) => new()
        {
            GameId = gameId,
            Editions = new List<GameEdition>
            {
                new() { Code = "standard", Title = "Standard", Price = 60m, IsDefault = true },
                new() { Code = "deluxe", Title = "Deluxe Edition", Price = 80m, DiscountPercent = 25m }
            }
        };

        [Fact]
        public async Task Edition_line_is_priced_by_the_edition_and_keeps_its_code_and_title()
        {
            var service = Build(details: new[] { DetailsWithEditions() });

            var result = await service.PriceAsync(new CheckoutPricingRequest
            {
                Items = new List<CheckoutPricingItem> { new() { GameId = GameId, Quantity = 1, EditionCode = "deluxe" } },
                UserName = "user-1"
            });

            Assert.True(result.Success, result.Error);
            var line = Assert.Single(result.Items);
            // Своя скидка издания (25% от 80) — и код/название остаются в строке для заказа и выдачи ключей.
            Assert.Equal(80m, line.UnitPrice);
            Assert.Equal(60m, line.FinalUnitPrice);
            Assert.Equal("deluxe", line.EditionCode);
            Assert.Equal("Deluxe Edition", line.EditionTitle);
            Assert.Equal("Test Game — Deluxe Edition", line.Title);
        }

        [Fact]
        public async Task Default_edition_is_priced_by_the_edition_and_keeps_its_code_for_the_order()
        {
            var service = Build(details: new[] { DetailsWithEditions() });

            var result = await service.PriceAsync(new CheckoutPricingRequest
            {
                Items = new List<CheckoutPricingItem> { new() { GameId = GameId, Quantity = 1, EditionCode = "standard" } },
                UserName = "user-1"
            });

            Assert.True(result.Success, result.Error);
            var line = Assert.Single(result.Items);
            // Код издания по умолчанию остаётся в строке: раньше он обнулялся, и выдача видела только ключи
            // без кода, хотя наличие считало и ключи с кодом. Ключи без кода добирает сама выдача.
            Assert.Equal("standard", line.EditionCode);
            Assert.Equal("Standard", line.EditionTitle);
            Assert.Equal(60m, line.FinalUnitPrice);
        }

        [Fact]
        public async Task Same_edition_in_different_letter_case_is_one_line_with_the_catalog_spelling()
        {
            // «deluxe» и «DELUXE» — одно издание. Раньше это были две строки в обход лимита количества,
            // а вторая ещё и не выдавалась: склад ищет издание точным сравнением кода.
            var service = Build(details: new[] { DetailsWithEditions() });

            var result = await service.PriceAsync(new CheckoutPricingRequest
            {
                Items = new List<CheckoutPricingItem>
                {
                    new() { GameId = GameId, Quantity = 6, EditionCode = "deluxe" },
                    new() { GameId = GameId.ToUpperInvariant(), Quantity = 6, EditionCode = "DELUXE" }
                },
                UserName = "user-1"
            });

            Assert.False(result.Success);
            Assert.Contains("Quantity", result.Error);

            var within = await service.PriceAsync(new CheckoutPricingRequest
            {
                Items = new List<CheckoutPricingItem>
                {
                    new() { GameId = GameId, Quantity = 2, EditionCode = "deluxe" },
                    new() { GameId = GameId, Quantity = 3, EditionCode = " DELUXE " }
                },
                UserName = "user-1"
            });
            Assert.True(within.Success, within.Error);
            var line = Assert.Single(within.Items);
            Assert.Equal(5, line.Quantity);
            Assert.Equal("deluxe", line.EditionCode);
        }

        [Fact]
        public async Task Edition_with_a_region_offer_but_no_regional_price_is_charged_the_edition_price()
        {
            // Deluxe + Europe без своей региональной цены уходил по цене базовой игры (60 вместо 80),
            // а ключ выдавался Deluxe — магазин терял разницу на каждом таком заказе.
            var game = Game(60m);
            var europe = SuperBot.Core.Regions.RegionOffer.KeyOf(new SuperBot.Core.Regions.RegionPolicy { Mode = "Regions", Regions = new() { "EU" } });
            game.RegionPrices = new List<SuperBot.Core.Regions.RegionPrice> { new() { OfferKey = europe, Price = 45m } };
            var service = Build(new[] { game }, details: new[] { DetailsWithEditions() });

            var deluxe = await service.PriceAsync(new CheckoutPricingRequest
            {
                Items = new List<CheckoutPricingItem> { new() { GameId = GameId, Quantity = 1, EditionCode = "deluxe", OfferKey = europe } },
                UserName = "user-1"
            });
            Assert.True(deluxe.Success, deluxe.Error);
            // Региональная цена «для игры» относится к базовому изданию, а не к Deluxe.
            Assert.Equal(80m, Assert.Single(deluxe.Items).UnitPrice);

            var standard = await service.PriceAsync(new CheckoutPricingRequest
            {
                Items = new List<CheckoutPricingItem> { new() { GameId = GameId, Quantity = 1, EditionCode = "standard", OfferKey = europe } },
                UserName = "user-1"
            });
            Assert.True(standard.Success, standard.Error);
            Assert.Equal(45m, Assert.Single(standard.Items).UnitPrice);

            // Своя региональная цена издания — важнее всего.
            game.RegionPrices.Add(new SuperBot.Core.Regions.RegionPrice { OfferKey = europe, EditionCode = "deluxe", Price = 70m });
            var priced = await service.PriceAsync(new CheckoutPricingRequest
            {
                Items = new List<CheckoutPricingItem> { new() { GameId = GameId, Quantity = 1, EditionCode = "deluxe", OfferKey = europe } },
                UserName = "user-1"
            });
            Assert.Equal(70m, Assert.Single(priced.Items).UnitPrice);
        }

        [Fact]
        public async Task Two_editions_of_one_game_are_two_lines_and_unknown_edition_is_rejected()
        {
            var service = Build(details: new[] { DetailsWithEditions() });

            var both = await service.PriceAsync(new CheckoutPricingRequest
            {
                Items = new List<CheckoutPricingItem>
                {
                    new() { GameId = GameId, Quantity = 1, EditionCode = "standard" },
                    new() { GameId = GameId, Quantity = 1, EditionCode = "deluxe" }
                },
                UserName = "user-1"
            });
            Assert.True(both.Success, both.Error);
            Assert.Equal(2, both.Items.Count);
            Assert.Equal(120m, both.Total);

            var unknown = await service.PriceAsync(new CheckoutPricingRequest
            {
                Items = new List<CheckoutPricingItem> { new() { GameId = GameId, Quantity = 1, EditionCode = "ultimate" } },
                UserName = "user-1"
            });
            Assert.False(unknown.Success);
            Assert.Contains("edition", unknown.Error, StringComparison.OrdinalIgnoreCase);
        }
    }
}
