using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Payments;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Services
{
    public interface ICheckoutPricingService
    {
        Task<CheckoutPricingResult> PriceAsync(CheckoutPricingRequest request);
    }

    public class CheckoutPricingRequest
    {
        public List<CheckoutPricingItem> Items { get; set; } = new();
        public string? PromoCode { get; set; }
        /// <summary>Для лимитов промокода «на пользователя».</summary>
        public string? UserName { get; set; }

        /// <summary>
        /// Валюта, в которой покупатель хочет платить. Выбирать её клиенту теперь можно,
        /// но только из списка витрины: неизвестная валюта молча становится базовой
        /// (см. <see cref="StorefrontCurrencyOptions.Resolve"/>), а сумма всё равно берётся
        /// из каталога — клиентским числам по-прежнему не верим.
        /// </summary>
        public string? Currency { get; set; }
    }

    public class CheckoutPricingItem
    {
        public string GameId { get; set; } = string.Empty;
        public int Quantity { get; set; }
    }

    /// <summary>
    /// Посчитанная позиция заказа. Намеренно НЕ тип персистентности: раньше контракт сервиса
    /// возвращал CheckoutLineItemStateDb, из-за чего деталь хранения протекала во все вызывающие.
    /// </summary>
    public class CheckoutLineItem
    {
        public string ProductType { get; set; } = "Game";
        public string? GameId { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? CoverUrl { get; set; }
        public string? Platform { get; set; }
        public string? Region { get; set; }
        public int Quantity { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal DiscountPerUnit { get; set; }
        public decimal FinalUnitPrice { get; set; }
        public decimal LineTotal { get; set; }
        public string Currency { get; set; } = "USD";
    }

    public class CheckoutPricingResult
    {
        public bool Success { get; set; }
        public string? Error { get; set; }

        public List<CheckoutLineItem> Items { get; set; } = new();
        public decimal Subtotal { get; set; }
        public decimal DiscountTotal { get; set; }
        public decimal TaxTotal { get; set; }
        public decimal Total { get; set; }

        /// <summary>Сумма для Stripe в минорных единицах (центах) — без потери копеек.</summary>
        public long AmountMinorUnits { get; set; }

        /// <summary>Валюта расчёта — её определяет сервер, а не запрос.</summary>
        public string Currency { get; set; } = CheckoutPricingService.SettlementCurrency;

        public bool PromoApplied { get; set; }
        public string? NormalizedPromoCode { get; set; }
        public string? PromoMessage { get; set; }

        public static CheckoutPricingResult Fail(string error) => new() { Success = false, Error = error };
    }

    public class CheckoutPricingService : ICheckoutPricingService
    {
        /// <summary>
        /// Валюта каталога по умолчанию, когда конфигурация ничего не задала. Раньше это была
        /// единственная валюта расчёта и константа; теперь валюту выбирает покупатель из списка
        /// <see cref="StorefrontCurrencyOptions"/>, а цена берётся из прайс-листа игры.
        /// Осталась только как значение по умолчанию — того же смысла, что и до мультивалютности.
        /// </summary>
        public const string SettlementCurrency = GamePricing.LegacyCurrency;

        /// <summary>Максимум позиций в одном заказе — защита от раздувания запроса.</summary>
        private const int MaxLineItems = 50;
        /// <summary>Максимум одной позиции — защита от абсурдных количеств.</summary>
        private const int MaxQuantityPerItem = 10;

        private readonly IGameRepository _gameRepository;
        private readonly IGameDiscountRepository _gameDiscountRepository;
        private readonly IPromoCodeService _promoCodeService;
        private readonly StorefrontCurrencyOptions _currencies;
        private readonly IFxRateService _fxRates;
        private readonly FxOptions _fx;
        private readonly ILogger<CheckoutPricingService> _logger;

        public CheckoutPricingService(
            IGameRepository gameRepository,
            IGameDiscountRepository gameDiscountRepository,
            IPromoCodeService promoCodeService,
            IOptions<StorefrontCurrencyOptions> currencies,
            IFxRateService fxRates,
            IOptionsSnapshot<FxOptions> fx,
            ILogger<CheckoutPricingService> logger)
        {
            _gameRepository = gameRepository;
            _gameDiscountRepository = gameDiscountRepository;
            _promoCodeService = promoCodeService;
            _currencies = currencies.Value;
            _fxRates = fxRates;
            _fx = fx.Value;
            _logger = logger;
        }

        public async Task<CheckoutPricingResult> PriceAsync(CheckoutPricingRequest request)
        {
            var requested = (request.Items ?? new List<CheckoutPricingItem>())
                .Where(item => !string.IsNullOrWhiteSpace(item.GameId))
                .ToList();

            if (requested.Count == 0)
            {
                return CheckoutPricingResult.Fail("Cart is empty.");
            }

            if (requested.Count > MaxLineItems)
            {
                return CheckoutPricingResult.Fail("Too many items in cart.");
            }

            if (requested.Any(item => item.Quantity <= 0 || item.Quantity > MaxQuantityPerItem))
            {
                return CheckoutPricingResult.Fail($"Quantity must be between 1 and {MaxQuantityPerItem}.");
            }

            // Схлопываем дубликаты одного gameId, чтобы обойти лимит количества было нельзя.
            var quantityByGameId = requested
                .GroupBy(item => item.GameId, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(group => group.Key, group => group.Sum(item => item.Quantity), StringComparer.OrdinalIgnoreCase);

            if (quantityByGameId.Values.Any(quantity => quantity > MaxQuantityPerItem))
            {
                return CheckoutPricingResult.Fail($"Quantity must be between 1 and {MaxQuantityPerItem}.");
            }

            var gameIds = quantityByGameId.Keys.ToList();
            var games = await _gameRepository.GetByIdsAsync(gameIds);
            var gameById = games
                .Where(game => !string.IsNullOrWhiteSpace(game.Id))
                .ToDictionary(game => game.Id!, StringComparer.OrdinalIgnoreCase);

            var missing = gameIds.Where(id => !gameById.ContainsKey(id)).ToList();
            if (missing.Count > 0)
            {
                return CheckoutPricingResult.Fail("Some items are no longer available.");
            }

            var discounts = await _gameDiscountRepository.GetByGameIdsAsync(gameIds);
            var discountByGameId = discounts
                .Where(discount => !string.IsNullOrWhiteSpace(discount.GameId))
                .ToDictionary(discount => discount.GameId!, StringComparer.OrdinalIgnoreCase);

            // Валюта одна на весь заказ и берётся из списка витрины: смешивать в одном
            // платеже позиции в разных валютах нельзя — провайдер списывает одной суммой.
            var currency = _currencies.Resolve(request.Currency);
            var utcNow = DateTime.UtcNow;
            var lineItems = new List<CheckoutLineItem>();

            foreach (var (gameId, quantity) in quantityByGameId)
            {
                var game = gameById[gameId];

                // В заказе должно стоять ТО ЖЕ название, что покупатель видел на витрине,
                // а витрина (каталог, карточка игры, рекомендации) показывает Title.
                // Раньше сюда попадал Name — и в чеке оказывалось другое имя товара.
                var title = !string.IsNullOrWhiteSpace(game.Title) ? game.Title : (game.Name ?? "Game");

                // Невышедшие игры видны на витрине, но не продаются. Прайсинг — единая точка
                // всех оплат (Stripe, крипто), поэтому запрет живёт именно здесь.
                if (SuperBot.Core.Services.GameRelease.IsUpcoming(game.ReleaseDate, utcNow))
                {
                    return CheckoutPricingResult.Fail($"“{title}” isn't released yet.");
                }

                discountByGameId.TryGetValue(gameId, out var discount);
                var discountActive = discount is not null && discount.IsActiveAt(utcNow);
                var discountPercent = discountActive ? discount!.DiscountPercent : (decimal?)null;

                // Цена берётся из прайс-листа игры. Нет цены в этой валюте — отказ, а не пересчёт
                // и не молчаливый откат к базовой: списать 59.99 в валюте, где это другие деньги,
                // хуже, чем честно сказать «в этой валюте не продаём».
                var price = GamePricing.TryGetPrice(game, currency, _fxRates.Current(), _fx);
                if (price is null)
                {
                    _logger.LogWarning(
                        "Нет цены для игры {GameId} в валюте {Currency} — чекаут отклонён.", gameId, currency);
                    return CheckoutPricingResult.Fail($"“{title}” isn't available in {currency}.");
                }

                var unitPrice = price.Value;
                var finalUnitPrice = CalculateFinalPrice(unitPrice, discountPercent);
                if (finalUnitPrice < 0)
                {
                    return CheckoutPricingResult.Fail("Invalid price configuration.");
                }

                lineItems.Add(new CheckoutLineItem
                {
                    ProductType = "Game",
                    GameId = gameId,
                    Title = title,
                    CoverUrl = game.ImagePath,
                    Quantity = quantity,
                    UnitPrice = unitPrice,
                    DiscountPerUnit = unitPrice - finalUnitPrice,
                    FinalUnitPrice = finalUnitPrice,
                    LineTotal = finalUnitPrice * quantity,
                    Currency = currency
                });
            }

            var subtotal = lineItems.Sum(item => item.UnitPrice * item.Quantity);
            var itemDiscountTotal = lineItems.Sum(item => item.DiscountPerUnit * item.Quantity);
            var afterItemDiscounts = lineItems.Sum(item => item.LineTotal);

            // Промокод считает существующий сервис — от суммы УЖЕ со скидками каталога.
            var promoDiscount = 0m;
            var promoApplied = false;
            string? normalizedPromo = null;
            string? promoMessage = null;

            if (!string.IsNullOrWhiteSpace(request.PromoCode))
            {
                var validation = await _promoCodeService.ValidateAsync(new PromoValidationRequest
                {
                    Code = request.PromoCode.Trim(),
                    CartSubtotal = afterItemDiscounts,
                    UserName = request.UserName,
                    // Промокод на фиксированную сумму — это сумма в конкретной валюте.
                    // Без валюты в запросе «минус 10» в евро дало бы совсем не ту скидку.
                    Currency = currency
                });

                promoMessage = validation.Message;
                if (validation.Valid)
                {
                    promoApplied = true;
                    normalizedPromo = validation.NormalizedCode ?? request.PromoCode.Trim().ToUpperInvariant();
                    promoDiscount = Math.Max(0m, Math.Min(validation.DiscountAmount, afterItemDiscounts));
                }
            }

            var taxTotal = 0m;
            var total = afterItemDiscounts - promoDiscount + taxTotal;
            if (total < 0)
            {
                total = 0m;
            }

            // Точность округления берём у валюты, а не из константы: у JPY и XTR дробной части нет.
            total = CurrencyMinorUnits.Round(total, currency);

            // Центы считаем один раз и здесь же — дальше сумма никем не пересчитывается.
            var amountMinorUnits = CurrencyMinorUnits.ToMinor(total, currency);
            if (amountMinorUnits <= 0)
            {
                return CheckoutPricingResult.Fail("Order total must be greater than zero.");
            }

            return new CheckoutPricingResult
            {
                Success = true,
                Items = lineItems,
                Currency = currency,
                Subtotal = subtotal,
                DiscountTotal = itemDiscountTotal + promoDiscount,
                TaxTotal = taxTotal,
                Total = total,
                AmountMinorUnits = amountMinorUnits,
                PromoApplied = promoApplied,
                NormalizedPromoCode = normalizedPromo,
                PromoMessage = promoMessage
            };
        }

        /// <summary>Цена в чекауте обязана совпадать с витриной — формула общая на весь проект.</summary>
        private static decimal CalculateFinalPrice(decimal price, decimal? discountPercent) =>
            SuperBot.Core.Services.PriceCalculator.FinalPrice(price, discountPercent);
    }
}
