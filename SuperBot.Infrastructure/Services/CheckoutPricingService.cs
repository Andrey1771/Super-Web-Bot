using Microsoft.Extensions.Logging;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
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
        public string Currency { get; set; } = "USD";
        /// <summary>Для лимитов промокода «на пользователя».</summary>
        public string? UserName { get; set; }
    }

    public class CheckoutPricingItem
    {
        public string GameId { get; set; } = string.Empty;
        public int Quantity { get; set; }
    }

    public class CheckoutPricingResult
    {
        public bool Success { get; set; }
        public string? Error { get; set; }

        public List<CheckoutLineItemStateDb> Items { get; set; } = new();
        public decimal Subtotal { get; set; }
        public decimal DiscountTotal { get; set; }
        public decimal TaxTotal { get; set; }
        public decimal Total { get; set; }

        /// <summary>Сумма для Stripe в минорных единицах (центах) — без потери копеек.</summary>
        public long AmountMinorUnits { get; set; }

        public bool PromoApplied { get; set; }
        public string? NormalizedPromoCode { get; set; }
        public string? PromoMessage { get; set; }

        public static CheckoutPricingResult Fail(string error) => new() { Success = false, Error = error };
    }

    public class CheckoutPricingService : ICheckoutPricingService
    {
        /// <summary>Максимум позиций в одном заказе — защита от раздувания запроса.</summary>
        private const int MaxLineItems = 50;
        /// <summary>Максимум одной позиции — защита от абсурдных количеств.</summary>
        private const int MaxQuantityPerItem = 10;

        private readonly IGameRepository _gameRepository;
        private readonly IGameDiscountRepository _gameDiscountRepository;
        private readonly IPromoCodeService _promoCodeService;
        private readonly ILogger<CheckoutPricingService> _logger;

        public CheckoutPricingService(
            IGameRepository gameRepository,
            IGameDiscountRepository gameDiscountRepository,
            IPromoCodeService promoCodeService,
            ILogger<CheckoutPricingService> logger)
        {
            _gameRepository = gameRepository;
            _gameDiscountRepository = gameDiscountRepository;
            _promoCodeService = promoCodeService;
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

            var currency = string.IsNullOrWhiteSpace(request.Currency) ? "USD" : request.Currency.Trim().ToUpperInvariant();
            var utcNow = DateTime.UtcNow;
            var lineItems = new List<CheckoutLineItemStateDb>();

            foreach (var (gameId, quantity) in quantityByGameId)
            {
                var game = gameById[gameId];

                discountByGameId.TryGetValue(gameId, out var discount);
                var discountActive = discount is not null && discount.IsActiveAt(utcNow);
                var discountPercent = discountActive ? discount!.DiscountPercent : (decimal?)null;

                var unitPrice = game.Price;
                var finalUnitPrice = CalculateFinalPrice(unitPrice, discountPercent);
                if (finalUnitPrice < 0)
                {
                    return CheckoutPricingResult.Fail("Invalid price configuration.");
                }

                lineItems.Add(new CheckoutLineItemStateDb
                {
                    ProductType = "Game",
                    GameId = gameId,
                    Title = string.IsNullOrWhiteSpace(game.Name) ? game.Title ?? "Game" : game.Name,
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
                    UserName = request.UserName
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

            total = Math.Round(total, 2, MidpointRounding.AwayFromZero);

            // Центы считаем один раз и здесь же — дальше сумма никем не пересчитывается.
            var amountMinorUnits = (long)Math.Round(total * 100m, MidpointRounding.AwayFromZero);
            if (amountMinorUnits <= 0)
            {
                return CheckoutPricingResult.Fail("Order total must be greater than zero.");
            }

            return new CheckoutPricingResult
            {
                Success = true,
                Items = lineItems,
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

        /// <summary>
        /// Та же формула, что на витрине (GameController.CalculateFinalPrice) — цена в чекауте
        /// обязана совпадать с ценой в каталоге до копейки.
        /// TODO: формула продублирована ещё в GameController/GamesDetailsController/NewsletterDispatcher —
        /// стоит свести к одному месту отдельной задачей.
        /// </summary>
        private static decimal CalculateFinalPrice(decimal price, decimal? discountPercent)
        {
            if (!discountPercent.HasValue || discountPercent.Value <= 0)
            {
                return price;
            }

            var result = price * (1 - (discountPercent.Value / 100m));
            return Math.Round(result, 2, MidpointRounding.AwayFromZero);
        }
    }
}
