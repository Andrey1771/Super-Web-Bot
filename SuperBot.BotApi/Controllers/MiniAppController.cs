using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Payments;
using SuperBot.Core.Services;
using SuperBot.BotApi.Services;
using SuperBot.BotApi.Types;
using Telegram.Bot;
using Telegram.Bot.Types.Payments;

namespace SuperBot.BotApi.Controllers
{
    /// <summary>
    /// Бэкенд Telegram Mini App (витрина внутри Telegram). Каталог берётся из публичного /api/game;
    /// здесь — только оплата: проверка initData и создание Stars-invoice-ссылки.
    /// </summary>
    [ApiController]
    [Route("api/miniapp")]
    public class MiniAppController(
        IGameRepository _gameRepository,
        IOrderRepository _orderRepository,
        ITelegramBotClient _bot,
        TelegramInitDataValidator _initDataValidator,
        IOptions<BotConfiguration> _botConfig,
        IConfiguration _configuration,
        // Курсы нужны, чтобы посчитать звёзды для игры не в долларах: ставка «звёзд за доллар»
        // одна на весь бот, поэтому сумму сперва приводим к долларам.
        SuperBot.Infrastructure.Services.IFxRateService _fxRates,
        ILogger<MiniAppController> _logger) : ControllerBase
    {
        private static readonly TimeSpan InitDataMaxAge = TimeSpan.FromHours(24);

        // payload инвойса-корзины: cart:<orderId>. На successful_payment по нему находим заказ и выдаём целиком.
        public const string CartPayloadPrefix = "cart:";
        private const int MaxCartItems = 20;

        [HttpPost("invoice")]
        public async Task<IActionResult> CreateInvoice([FromBody] MiniAppInvoiceRequest request)
        {
            var botToken = _botConfig.Value.BotToken;
            var user = _initDataValidator.Validate(request?.InitData ?? string.Empty, botToken, InitDataMaxAge);
            if (user == null)
            {
                // initData не прошёл проверку подписи — запрос не из Telegram.
                return Unauthorized("Invalid Telegram init data.");
            }

            if (string.IsNullOrWhiteSpace(request!.GameId))
            {
                return BadRequest("GameId is required.");
            }

            var game = await _gameRepository.GetByIdAsync(request.GameId);
            if (game == null)
            {
                return NotFound("Game not found.");
            }

            // Stars-оплата идёт мимо CheckoutPricingService, поэтому запрет на невышедшие — здесь.
            if (GameRelease.IsUpcoming(game.ReleaseDate, DateTime.UtcNow))
            {
                return BadRequest("Game is not released yet.");
            }

            var title = string.IsNullOrWhiteSpace(game.Title) ? game.Name : game.Title;
            var starsPerUsd = _configuration.GetValue<int?>("BotPayments:StarsPerUsd") ?? StarPrice.DefaultStarsPerUsd;
            var stars = StarPrice.FromAmount(game.Price, game.Currency, _fxRates.Current(), starsPerUsd);
            if (stars is null)
            {
                return BadRequest("This game can't be paid with Stars.");
            }

            var prices = new[] { new LabeledPrice(title, stars.Value) };

            try
            {
                // XTR + пустой provider_token = цифровой товар за Telegram Stars. payload = gameId
                // (successful_payment ловит тот же вебхук, что и покупки из чата — общая выдача).
                var invoiceLink = await _bot.CreateInvoiceLinkAsync(
                    title: title,
                    description: string.Format(Description(), title),
                    payload: game.Id,
                    currency: "XTR",
                    prices: prices);

                return Ok(new { invoiceLink, stars, title });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to create Stars invoice link for game {GameId}", request.GameId);
                return StatusCode(StatusCodes.Status502BadGateway, "Could not create invoice.");
            }
        }

        [HttpGet("config")]
        public IActionResult GetConfig()
        {
            // Курс пересчёта USD→Telegram Stars — чтобы Mini App показывал цену в звёздах (реальная валюта оплаты).
            var starsPerUsd = _configuration.GetValue<int?>("BotPayments:StarsPerUsd") ?? StarPrice.DefaultStarsPerUsd;
            return Ok(new { starsPerUsd });
        }

        [HttpPost("cart-invoice")]
        public async Task<IActionResult> CreateCartInvoice([FromBody] MiniAppCartRequest request)
        {
            var botToken = _botConfig.Value.BotToken;
            var user = _initDataValidator.Validate(request?.InitData ?? string.Empty, botToken, InitDataMaxAge);
            if (user == null)
            {
                return Unauthorized("Invalid Telegram init data.");
            }

            var lines = request!.Items?
                .Where(item => item != null && !string.IsNullOrWhiteSpace(item.GameId) && item.Quantity > 0)
                .ToList() ?? new List<MiniAppCartItem>();

            if (lines.Count == 0)
            {
                return BadRequest("Cart is empty.");
            }
            if (lines.Count > MaxCartItems)
            {
                return BadRequest($"Too many items (max {MaxCartItems}).");
            }

            var starsPerUsd = _configuration.GetValue<int?>("BotPayments:StarsPerUsd") ?? StarPrice.DefaultStarsPerUsd;
            var prices = new List<LabeledPrice>();
            var orderItems = new List<OrderItemSnapshot>();
            var totalStars = 0;

            foreach (var line in lines)
            {
                var game = await _gameRepository.GetByIdAsync(line.GameId);
                if (game == null)
                {
                    return NotFound($"Game not found: {line.GameId}.");
                }

                if (GameRelease.IsUpcoming(game.ReleaseDate, DateTime.UtcNow))
                {
                    return BadRequest($"Game is not released yet: {line.GameId}.");
                }

                var quantity = Math.Clamp(line.Quantity, 1, 10);
                var title = string.IsNullOrWhiteSpace(game.Title) ? game.Name : game.Title;
                var unitStars = StarPrice.FromAmount(game.Price, game.Currency, _fxRates.Current(), starsPerUsd);
                if (unitStars is null)
                {
                    // Цену в звёздах посчитать нечем — отказываем, а не берём число из другой валюты.
                    return BadRequest($"Game can't be paid with Stars: {line.GameId}.");
                }

                var lineStars = unitStars.Value * quantity;
                totalStars += lineStars;

                prices.Add(new LabeledPrice(quantity > 1 ? $"{title} ×{quantity}" : title, lineStars));
                orderItems.Add(new OrderItemSnapshot
                {
                    GameId = game.Id,
                    Title = title,
                    Quantity = quantity,
                    UnitPrice = game.Price,
                    FinalUnitPrice = game.Price,
                    LineTotal = game.Price * quantity
                });
            }

            // «Ожидающий» заказ создаём заранее: его id уходит в payload, а на оплате заказ находится и выдаётся.
            var now = DateTime.UtcNow;
            var orderId = Guid.NewGuid();
            var order = new Order
            {
                Id = orderId,
                OrderGuid = orderId,
                UserId = $"tg:{user.UserId}",
                UserName = string.IsNullOrWhiteSpace(user.Username) ? $"tg:{user.UserId}" : user.Username,
                PaymentProvider = "telegram_stars",
                GameId = orderItems[0].GameId,
                GameName = orderItems.Count == 1 ? orderItems[0].Title : $"{orderItems[0].Title} +{orderItems.Count - 1}",
                IsPaid = false,
                IsFulfilled = false,
                OrderDate = now,
                CreatedAt = now,
                Status = "AWAITING_PAYMENT",
                PaymentStatus = "PENDING",
                FulfillmentStatus = "PENDING_KEYS",
                Currency = "XTR",
                TotalAmount = totalStars,
                Items = orderItems
            };

            await _orderRepository.CreateOrderAsync(order);

            try
            {
                var itemsSummary = orderItems.Count == 1
                    ? orderItems[0].Title
                    : $"{orderItems.Count} товаров";

                var invoiceLink = await _bot.CreateInvoiceLinkAsync(
                    title: "Tale Shop",
                    description: $"Заказ: {itemsSummary}. Ключи придут в чат бота.",
                    payload: $"{CartPayloadPrefix}{orderId}",
                    currency: "XTR",
                    prices: prices);

                return Ok(new { invoiceLink, stars = totalStars, items = orderItems.Count });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to create Stars cart invoice for order {OrderId}", orderId);
                return StatusCode(StatusCodes.Status502BadGateway, "Could not create invoice.");
            }
        }

        private static string Description() => "Цифровой ключ «{0}» с моментальной доставкой в чат бота.";

        public class MiniAppInvoiceRequest
        {
            public string InitData { get; set; } = string.Empty;
            public string GameId { get; set; } = string.Empty;
        }

        public class MiniAppCartRequest
        {
            public string InitData { get; set; } = string.Empty;
            public List<MiniAppCartItem> Items { get; set; } = new();
        }

        public class MiniAppCartItem
        {
            public string GameId { get; set; } = string.Empty;
            public int Quantity { get; set; } = 1;
        }
    }
}
