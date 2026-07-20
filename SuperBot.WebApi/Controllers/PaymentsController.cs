using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using Stripe;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class PaymentsController : ControllerBase
    {
        private const int MaxFinalizeAttempts = 3;
        private static readonly TimeSpan ProcessingCooldown = TimeSpan.FromSeconds(60);

        private readonly IOrderRepository _orderRepository;
        private readonly IKeyFulfillmentService _keyFulfillmentService;
        private readonly ILogger<PaymentsController> _logger;
        private readonly IMongoCollection<PaymentFinalizationStateDb> _finalizationStates;
        private readonly IMongoCollection<PaymentFinalizationFailureDb> _finalizationFailures;

        public PaymentsController(
            IOrderRepository orderRepository,
            IKeyFulfillmentService keyFulfillmentService,
            ILogger<PaymentsController> logger,
            IMongoDatabase database)
        {
            _orderRepository = orderRepository;
            _keyFulfillmentService = keyFulfillmentService;
            _logger = logger;
            _finalizationStates = database.GetCollection<PaymentFinalizationStateDb>("PaymentFinalizationStates");
            _finalizationFailures = database.GetCollection<PaymentFinalizationFailureDb>("PaymentFinalizationFailures");
        }

        [HttpPost("create-payment-intent")]
        public async Task<ActionResult> CreatePaymentIntent([FromBody] CreatePaymentIntentRequest request)
        {
            if (request.Amount <= 0)
            {
                return BadRequest("Amount must be greater than zero.");
            }

            if (request.Items.Count == 0)
            {
                return BadRequest("At least one item is required.");
            }

            var userId = GetCurrentUserId();
            if (string.IsNullOrWhiteSpace(userId))
            {
                return Unauthorized();
            }

            var currency = string.IsNullOrWhiteSpace(request.Currency) ? "USD" : request.Currency.Trim().ToUpperInvariant();
            var checkoutItems = request.Items
                .Where(item => item.Quantity > 0)
                .Select(item =>
                {
                    var finalUnitPrice = item.FinalUnitPrice > 0 ? item.FinalUnitPrice : Math.Max(0m, item.UnitPrice - item.DiscountPerUnit);
                    var lineTotal = item.LineTotal > 0 ? item.LineTotal : finalUnitPrice * item.Quantity;
                    return new CheckoutLineItemStateDb
                    {
                        ProductType = string.IsNullOrWhiteSpace(item.ProductType) ? "Game" : item.ProductType,
                        GameId = item.GameId,
                        Title = item.Title,
                        CoverUrl = item.CoverUrl,
                        Platform = item.Platform,
                        Region = item.Region,
                        Quantity = item.Quantity,
                        UnitPrice = item.UnitPrice,
                        DiscountPerUnit = item.DiscountPerUnit,
                        FinalUnitPrice = finalUnitPrice,
                        LineTotal = lineTotal,
                        Currency = currency
                    };
                })
                .ToList();

            if (checkoutItems.Count == 0)
            {
                return BadRequest("At least one item with quantity > 0 is required.");
            }

            var subtotal = request.Subtotal > 0 ? request.Subtotal : checkoutItems.Sum(item => item.UnitPrice * item.Quantity);
            var discountTotal = request.DiscountTotal >= 0 ? request.DiscountTotal : checkoutItems.Sum(item => item.DiscountPerUnit * item.Quantity);
            var taxTotal = request.TaxTotal >= 0 ? request.TaxTotal : 0m;
            var total = request.Total > 0 ? request.Total : checkoutItems.Sum(item => item.LineTotal) + taxTotal;

            var firstItem = checkoutItems.First();
            var metadata = new Dictionary<string, string>
            {
                ["userId"] = userId,
                ["itemCount"] = checkoutItems.Count.ToString(),
                ["firstItemGameId"] = firstItem.GameId ?? string.Empty,
                ["firstItemTitle"] = firstItem.Title,
                ["currency"] = currency
            };

            if (!string.IsNullOrWhiteSpace(request.PromoCode))
            {
                metadata["promoCode"] = request.PromoCode.Trim();
            }

            var options = new PaymentIntentCreateOptions
            {
                Amount = request.Amount * 100,
                Currency = currency.ToLowerInvariant(),
                Metadata = metadata,
                AutomaticPaymentMethods = new PaymentIntentAutomaticPaymentMethodsOptions { Enabled = true }
            };

            var service = new PaymentIntentService();
            var paymentIntent = service.Create(options);

            var now = DateTime.UtcNow;
            var stateUpdate = Builders<PaymentFinalizationStateDb>.Update
                .Set(item => item.PaymentIntentId, paymentIntent.Id)
                .Set(item => item.UserId, userId)
                .Set(item => item.Status, FinalizationStatus.Created)
                .Set(item => item.Attempts, 0)
                .Set(item => item.Currency, currency)
                .Set(item => item.Subtotal, subtotal)
                .Set(item => item.DiscountTotal, discountTotal)
                .Set(item => item.TaxTotal, taxTotal)
                .Set(item => item.Total, total)
                .Set(item => item.CheckoutItems, checkoutItems)
                .Set(item => item.UpdatedAt, now)
                .SetOnInsert(item => item.CreatedAt, now);

            await _finalizationStates.UpdateOneAsync(item => item.PaymentIntentId == paymentIntent.Id, stateUpdate, new UpdateOptions { IsUpsert = true });

            return Ok(new { ClientSecret = paymentIntent.ClientSecret });
        }

        [HttpPost("confirm-payment-intent")]
        public async Task<ActionResult<ConfirmPaymentIntentResponse>> ConfirmPaymentIntent([FromBody] ConfirmPaymentIntentRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.PaymentIntentId))
            {
                return BadRequest("paymentIntentId is required.");
            }

            var userId = GetCurrentUserId();
            if (string.IsNullOrWhiteSpace(userId))
            {
                return Unauthorized();
            }

            var now = DateTime.UtcNow;
            var state = await _finalizationStates.Find(item => item.PaymentIntentId == request.PaymentIntentId).FirstOrDefaultAsync();

            if (state?.Status == FinalizationStatus.Succeeded && !string.IsNullOrWhiteSpace(state.OrderId))
            {
                return Ok(new ConfirmPaymentIntentResponse { OrderId = state.OrderId, Status = "already_confirmed" });
            }

            if (state?.Status == FinalizationStatus.Processing && now - state.UpdatedAt < ProcessingCooldown)
            {
                return StatusCode(StatusCodes.Status409Conflict, new ApiErrorResponse
                {
                    Code = "FINALIZATION_ALREADY_PROCESSING",
                    Message = "Your payment is already being processed. Please wait a moment and refresh.",
                    TraceId = HttpContext.TraceIdentifier
                });
            }

            if (state?.Status == FinalizationStatus.Failed && state.Attempts >= MaxFinalizeAttempts)
            {
                return StatusCode(StatusCodes.Status429TooManyRequests, new ApiErrorResponse
                {
                    Code = "FINALIZATION_ATTEMPTS_EXCEEDED",
                    Message = "We couldn't finalize your order yet. Please contact support with the reference below.",
                    TraceId = HttpContext.TraceIdentifier
                });
            }

            var attempts = (state?.Attempts ?? 0) + 1;
            var processingUpdate = Builders<PaymentFinalizationStateDb>.Update
                .Set(item => item.PaymentIntentId, request.PaymentIntentId)
                .Set(item => item.UserId, userId)
                .Set(item => item.Status, FinalizationStatus.Processing)
                .Set(item => item.Attempts, attempts)
                .Set(item => item.LastErrorCode, null)
                .Set(item => item.LastErrorMessage, null)
                .Set(item => item.UpdatedAt, now)
                .SetOnInsert(item => item.CreatedAt, now);

            await _finalizationStates.UpdateOneAsync(item => item.PaymentIntentId == request.PaymentIntentId, processingUpdate, new UpdateOptions { IsUpsert = true });

            try
            {
                var paymentIntentService = new PaymentIntentService();
                var paymentIntent = await paymentIntentService.GetAsync(request.PaymentIntentId);
                if (paymentIntent == null)
                {
                    await MarkFailedAsync(request.PaymentIntentId, userId, attempts, "PAYMENT_INTENT_NOT_FOUND", "Payment intent not found.", null);
                    return NotFound("Payment intent not found.");
                }

                var metadataUserId = paymentIntent.Metadata.TryGetValue("userId", out var storedUserId) ? storedUserId : string.Empty;
                if (!string.IsNullOrWhiteSpace(metadataUserId) && !string.Equals(metadataUserId, userId, StringComparison.OrdinalIgnoreCase))
                {
                    await MarkFailedAsync(request.PaymentIntentId, userId, attempts, "PAYMENT_OWNER_MISMATCH", "Payment intent belongs to another user.", null);
                    return Forbid();
                }

                if (!string.Equals(paymentIntent.Status, "succeeded", StringComparison.OrdinalIgnoreCase))
                {
                    await MarkFailedAsync(request.PaymentIntentId, userId, attempts, "PAYMENT_NOT_SUCCEEDED", $"Payment status: {paymentIntent.Status}", null);
                    return BadRequest($"Payment is not successful yet. Status: {paymentIntent.Status}.");
                }

                var existing = (await _orderRepository.GetOrdersByUserAsync(userId))
                    .FirstOrDefault(order => string.Equals(order.PaymentIntentId, request.PaymentIntentId, StringComparison.OrdinalIgnoreCase)
                                             || string.Equals(order.Notes, BuildPaymentNote(request.PaymentIntentId), StringComparison.OrdinalIgnoreCase));
                if (existing != null)
                {
                    await MarkSucceededAsync(request.PaymentIntentId, userId, attempts, existing.Id.ToString());
                    await MarkFailureResolvedAsync(request.PaymentIntentId, existing.Id.ToString());
                    return Ok(new ConfirmPaymentIntentResponse { OrderId = existing.Id.ToString(), Status = "already_confirmed" });
                }

                state ??= await _finalizationStates.Find(item => item.PaymentIntentId == request.PaymentIntentId).FirstOrDefaultAsync();
                var orderItems = BuildOrderItemsFromState(state, paymentIntent);

                var totalAmount = state?.Total > 0 ? state.Total : (paymentIntent.AmountReceived > 0 ? paymentIntent.AmountReceived : paymentIntent.Amount) / 100m;
                var subtotalAmount = state?.Subtotal > 0 ? state.Subtotal : orderItems.Sum(item => item.UnitPrice * item.Quantity);
                var discountTotal = state?.DiscountTotal ?? orderItems.Sum(item => item.UnitDiscount * item.Quantity);
                var taxTotal = state?.TaxTotal ?? 0m;
                if (totalAmount <= 0)
                {
                    totalAmount = orderItems.Sum(item => item.LineTotal) + taxTotal;
                }

                var firstItem = orderItems.FirstOrDefault();
                var nowCreated = DateTime.UtcNow;
                var orderId = Guid.NewGuid();
                var order = new Order
                {
                    Id = orderId,
                    OrderGuid = orderId,
                    OrderNumber = GenerateOrderNumber(),
                    UserId = userId,
                    PaymentProvider = "stripe",
                    PaymentIntentId = request.PaymentIntentId,
                    GameId = firstItem?.GameId ?? string.Empty,
                    GameName = firstItem?.Title ?? "Checkout purchase",
                    UserName = userId,
                    IsPaid = true,
                    // Оплата подтверждена, но ключи ещё не выданы — это делает FulfillOrderAsync ниже,
                    // он же проставит честный статус (DELIVERED только если ключей хватило).
                    IsFulfilled = false,
                    OrderDate = nowCreated,
                    CreatedAt = nowCreated,
                    PaidAt = nowCreated,
                    UpdatedAt = nowCreated,
                    SnapshotVersion = 1,
                    Status = "AWAITING_KEYS",
                    PaymentStatus = "PAID",
                    FulfillmentStatus = "PENDING_KEYS",
                    SubtotalAmount = subtotalAmount,
                    DiscountTotal = discountTotal,
                    TaxTotal = taxTotal,
                    TotalAmount = totalAmount,
                    Totals = new MoneyTotals
                    {
                        Subtotal = subtotalAmount,
                        DiscountTotal = discountTotal,
                        TaxTotal = taxTotal,
                        Total = totalAmount
                    },
                    Currency = state?.Currency ?? paymentIntent.Currency?.ToUpperInvariant() ?? "USD",
                    PromoCode = paymentIntent.Metadata.TryGetValue("promoCode", out var promoCode) ? promoCode : null,
                    Notes = BuildPaymentNote(request.PaymentIntentId),
                    Events = new List<OrderEvent>
                    {
                        new() { Type = "created", Message = "Order created from payment intent", CreatedAt = nowCreated },
                        new() { Type = "paid", Message = "Stripe payment confirmed", CreatedAt = nowCreated }
                    },
                    Items = orderItems
                };

                await _orderRepository.CreateOrderAsync(order);

                // Выдаём ключи и проставляем реальный статус выдачи (заказ сохраняется внутри).
                await _keyFulfillmentService.FulfillOrderAsync(order);

                await MarkSucceededAsync(request.PaymentIntentId, userId, attempts, order.Id.ToString());
                await MarkFailureResolvedAsync(request.PaymentIntentId, order.Id.ToString());

                return Ok(new ConfirmPaymentIntentResponse { OrderId = order.Id.ToString(), Status = "confirmed" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to finalize order for payment intent {PaymentIntentId} and user {UserId}", request.PaymentIntentId, userId);
                await MarkFailedAsync(request.PaymentIntentId, userId, attempts, "ORDER_CREATE_FAILED", "We couldn't finalize your order. Please try again or contact support.", ex);
                return StatusCode(StatusCodes.Status500InternalServerError, new ApiErrorResponse
                {
                    Code = "ORDER_CREATE_FAILED",
                    Message = "We couldn't finalize your order. Please try again or contact support.",
                    TraceId = HttpContext.TraceIdentifier
                });
            }
        }

        private static List<OrderItemSnapshot> BuildOrderItemsFromState(PaymentFinalizationStateDb? state, PaymentIntent paymentIntent)
        {
            if (state?.CheckoutItems?.Count > 0)
            {
                return state.CheckoutItems.Where(item => item.Quantity > 0).Select(item =>
                {
                    var finalUnitPrice = item.FinalUnitPrice > 0 ? item.FinalUnitPrice : Math.Max(0m, item.UnitPrice - item.DiscountPerUnit);
                    var lineTotal = item.LineTotal > 0 ? item.LineTotal : finalUnitPrice * item.Quantity;
                    return new OrderItemSnapshot
                    {
                        ItemId = Guid.NewGuid().ToString("N"),
                        ProductType = string.IsNullOrWhiteSpace(item.ProductType) ? "Game" : item.ProductType,
                        GameId = item.GameId,
                        Title = string.IsNullOrWhiteSpace(item.Title) ? "Game purchase" : item.Title,
                        CoverUrl = item.CoverUrl,
                        Platform = item.Platform,
                        Region = item.Region,
                        Quantity = item.Quantity,
                        UnitPrice = item.UnitPrice,
                        UnitDiscount = item.DiscountPerUnit,
                        FinalUnitPrice = finalUnitPrice,
                        LineTotal = lineTotal,
                        Pricing = new PricingSnapshot { PriceSource = "catalog", OriginalUnitPrice = item.UnitPrice },
                        Delivery = new DeliverySnapshot { DeliveryType = "Key" },

                        TitleSnapshot = string.IsNullOrWhiteSpace(item.Title) ? "Game purchase" : item.Title,
                        CoverUrlSnapshot = item.CoverUrl,
                        PlatformSnapshot = item.Platform,
                        RegionSnapshot = item.Region,
                        Qty = item.Quantity,
                        UnitPriceSnapshot = item.UnitPrice,
                        UnitPriceCurrency = string.IsNullOrWhiteSpace(item.Currency) ? (state.Currency ?? "USD") : item.Currency,
                        DiscountSnapshot = item.DiscountPerUnit,
                        FinalUnitPriceSnapshot = finalUnitPrice,
                        LineTotalSnapshot = lineTotal,
                        DeliveryType = "Key"
                    };
                }).ToList();
            }

            var gameId = paymentIntent.Metadata.TryGetValue("firstItemGameId", out var firstGameId) ? firstGameId : string.Empty;
            var gameTitle = paymentIntent.Metadata.TryGetValue("firstItemTitle", out var firstTitle) ? firstTitle : "Checkout purchase";
            var total = (paymentIntent.AmountReceived > 0 ? paymentIntent.AmountReceived : paymentIntent.Amount) / 100m;
            var currency = paymentIntent.Currency?.ToUpperInvariant() ?? "USD";

            return
            [
                new OrderItemSnapshot
                {
                    ItemId = Guid.NewGuid().ToString("N"),
                    ProductType = "Game",
                    GameId = gameId,
                    Title = gameTitle,
                    Quantity = 1,
                    UnitPrice = total,
                    FinalUnitPrice = total,
                    LineTotal = total,
                    Pricing = new PricingSnapshot { PriceSource = "metadata" },
                    Delivery = new DeliverySnapshot { DeliveryType = "Key" },

                    TitleSnapshot = gameTitle,
                    Qty = 1,
                    UnitPriceSnapshot = total,
                    UnitPriceCurrency = currency,
                    FinalUnitPriceSnapshot = total,
                    LineTotalSnapshot = total,
                    DeliveryType = "Key"
                }
            ];
        }

        private async Task MarkSucceededAsync(string paymentIntentId, string userId, int attempts, string orderId)
        {
            var update = Builders<PaymentFinalizationStateDb>.Update
                .Set(item => item.UserId, userId)
                .Set(item => item.Status, FinalizationStatus.Succeeded)
                .Set(item => item.OrderId, orderId)
                .Set(item => item.Attempts, attempts)
                .Set(item => item.LastErrorCode, null)
                .Set(item => item.LastErrorMessage, null)
                .Set(item => item.UpdatedAt, DateTime.UtcNow)
                .SetOnInsert(item => item.CreatedAt, DateTime.UtcNow);

            await _finalizationStates.UpdateOneAsync(item => item.PaymentIntentId == paymentIntentId, update, new UpdateOptions { IsUpsert = true });
        }

        private async Task MarkFailedAsync(string paymentIntentId, string userId, int attempts, string code, string message, Exception? ex)
        {
            var traceId = HttpContext.TraceIdentifier;
            var now = DateTime.UtcNow;

            var stateUpdate = Builders<PaymentFinalizationStateDb>.Update
                .Set(item => item.UserId, userId)
                .Set(item => item.Status, FinalizationStatus.Failed)
                .Set(item => item.Attempts, attempts)
                .Set(item => item.LastErrorCode, code)
                .Set(item => item.LastErrorMessage, message)
                .Set(item => item.UpdatedAt, now)
                .SetOnInsert(item => item.CreatedAt, now);

            await _finalizationStates.UpdateOneAsync(item => item.PaymentIntentId == paymentIntentId, stateUpdate, new UpdateOptions { IsUpsert = true });

            var technicalDetails = ex == null ? null : $"{ex.GetType().Name}: {ex.Message}{Environment.NewLine}{ex.StackTrace}";
            var failureUpdate = Builders<PaymentFinalizationFailureDb>.Update
                .Set(item => item.UserId, userId)
                .Set(item => item.LastSeenAt, now)
                .Set(item => item.ErrorCode, code)
                .Set(item => item.ErrorMessage, message)
                .Set(item => item.TechnicalDetails, technicalDetails)
                .Set(item => item.TraceId, traceId)
                .Set(item => item.Attempts, attempts)
                .Set(item => item.Status, "Open")
                .SetOnInsert(item => item.PaymentIntentId, paymentIntentId)
                .SetOnInsert(item => item.CreatedAt, now);

            await _finalizationFailures.UpdateOneAsync(item => item.PaymentIntentId == paymentIntentId, failureUpdate, new UpdateOptions { IsUpsert = true });
        }

        private async Task MarkFailureResolvedAsync(string paymentIntentId, string orderId)
        {
            var update = Builders<PaymentFinalizationFailureDb>.Update
                .Set(item => item.Status, "Resolved")
                .Set(item => item.LastSeenAt, DateTime.UtcNow)
                .Set(item => item.OrderId, orderId);

            await _finalizationFailures.UpdateOneAsync(item => item.PaymentIntentId == paymentIntentId, update);
        }

        private static string GenerateOrderNumber()
        {
            var now = DateTime.UtcNow;
            return $"TS-{now:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";
        }

        private string GetCurrentUserId()
        {
            return User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? string.Empty;
        }

        private static string BuildPaymentNote(string paymentIntentId) => $"stripe_payment_intent:{paymentIntentId}";
    }

    public static class FinalizationStatus
    {
        public const string Created = "Created";
        public const string Processing = "Processing";
        public const string Succeeded = "Succeeded";
        public const string Failed = "Failed";
    }

    public class CreatePaymentIntentRequest
    {
        public long Amount { get; set; }
        public string Currency { get; set; } = "USD";
        public string? PromoCode { get; set; }
        public decimal Subtotal { get; set; }
        public decimal DiscountTotal { get; set; }
        public decimal TaxTotal { get; set; }
        public decimal Total { get; set; }
        public List<CreatePaymentIntentItemRequest> Items { get; set; } = new();
    }

    public class CreatePaymentIntentItemRequest
    {
        public string ProductType { get; set; } = "Game";
        public string GameId { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string? CoverUrl { get; set; }
        public string? Platform { get; set; }
        public string? Region { get; set; }
        public int Quantity { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal DiscountPerUnit { get; set; }
        public decimal FinalUnitPrice { get; set; }
        public decimal LineTotal { get; set; }
    }

    public class ConfirmPaymentIntentRequest
    {
        public string PaymentIntentId { get; set; } = string.Empty;
    }

    public class ConfirmPaymentIntentResponse
    {
        public string OrderId { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
    }

    public class ApiErrorResponse
    {
        public string Message { get; set; } = string.Empty;
        public string TraceId { get; set; } = string.Empty;
        public string Code { get; set; } = string.Empty;
    }
}
