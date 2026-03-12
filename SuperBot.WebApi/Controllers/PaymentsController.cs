using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using Stripe;
using SuperBot.Core.Entities;
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
        private readonly ILogger<PaymentsController> _logger;
        private readonly IMongoCollection<PaymentFinalizationStateDb> _finalizationStates;
        private readonly IMongoCollection<PaymentFinalizationFailureDb> _finalizationFailures;

        public PaymentsController(
            IOrderRepository orderRepository,
            ILogger<PaymentsController> logger,
            IMongoDatabase database)
        {
            _orderRepository = orderRepository;
            _logger = logger;
            _finalizationStates = database.GetCollection<PaymentFinalizationStateDb>("PaymentFinalizationStates");
            _finalizationFailures = database.GetCollection<PaymentFinalizationFailureDb>("PaymentFinalizationFailures");
        }

        [HttpPost("create-payment-intent")]
        public ActionResult CreatePaymentIntent([FromBody] CreatePaymentIntentRequest request)
        {
            if (request.Amount <= 0)
            {
                return BadRequest("Amount must be greater than zero.");
            }

            var userId = GetCurrentUserId();
            if (string.IsNullOrWhiteSpace(userId))
            {
                return Unauthorized();
            }

            var firstItem = request.Items.FirstOrDefault();
            var metadata = new Dictionary<string, string>
            {
                ["userId"] = userId,
                ["itemCount"] = request.Items.Count.ToString(),
                ["firstItemGameId"] = firstItem?.GameId ?? string.Empty,
                ["firstItemTitle"] = firstItem?.Title ?? "Checkout purchase"
            };

            if (!string.IsNullOrWhiteSpace(request.PromoCode))
            {
                metadata["promoCode"] = request.PromoCode.Trim();
            }

            var options = new PaymentIntentCreateOptions
            {
                Amount = request.Amount * 100,
                Currency = string.IsNullOrWhiteSpace(request.Currency) ? "usd" : request.Currency.Trim().ToLowerInvariant(),
                Metadata = metadata,
                AutomaticPaymentMethods = new PaymentIntentAutomaticPaymentMethodsOptions
                {
                    Enabled = true,
                }
            };

            var service = new PaymentIntentService();
            var paymentIntent = service.Create(options);

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
            var state = await _finalizationStates
                .Find(item => item.PaymentIntentId == request.PaymentIntentId)
                .FirstOrDefaultAsync();

            if (state?.Status == FinalizationStatus.Succeeded && state.OrderId.HasValue)
            {
                return Ok(new ConfirmPaymentIntentResponse
                {
                    OrderId = state.OrderId.Value.ToString(),
                    Status = "already_confirmed"
                });
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
            var processingState = state ?? new PaymentFinalizationStateDb
            {
                PaymentIntentId = request.PaymentIntentId,
                UserId = userId,
                CreatedAt = now
            };

            processingState.UserId = userId;
            processingState.Status = FinalizationStatus.Processing;
            processingState.Attempts = attempts;
            processingState.LastErrorCode = null;
            processingState.LastErrorMessage = null;
            processingState.UpdatedAt = now;

            await _finalizationStates.ReplaceOneAsync(
                item => item.PaymentIntentId == request.PaymentIntentId,
                processingState,
                new ReplaceOptions { IsUpsert = true });

            try
            {
                var paymentIntentService = new PaymentIntentService();
                var paymentIntent = await paymentIntentService.GetAsync(request.PaymentIntentId);
                if (paymentIntent == null)
                {
                    await MarkFailedAsync(request.PaymentIntentId, userId, attempts, "PAYMENT_INTENT_NOT_FOUND", "Payment intent not found.", null);
                    return NotFound("Payment intent not found.");
                }

                var metadataUserId = paymentIntent.Metadata.TryGetValue("userId", out var storedUserId)
                    ? storedUserId
                    : string.Empty;

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
                    .FirstOrDefault(order => string.Equals(order.Notes, BuildPaymentNote(request.PaymentIntentId), StringComparison.OrdinalIgnoreCase));

                if (existing != null)
                {
                    await MarkSucceededAsync(request.PaymentIntentId, userId, attempts, existing.Id);
                    await MarkFailureResolvedAsync(request.PaymentIntentId, existing.Id);
                    return Ok(new ConfirmPaymentIntentResponse
                    {
                        OrderId = existing.Id.ToString(),
                        Status = "already_confirmed"
                    });
                }

                var gameId = paymentIntent.Metadata.TryGetValue("firstItemGameId", out var firstGameId)
                    ? firstGameId
                    : string.Empty;
                var gameTitle = paymentIntent.Metadata.TryGetValue("firstItemTitle", out var firstTitle)
                    ? firstTitle
                    : "Checkout purchase";

                var totalAmount = (paymentIntent.AmountReceived > 0 ? paymentIntent.AmountReceived : paymentIntent.Amount) / 100m;

                var order = new Order
                {
                    GameId = gameId,
                    GameName = gameTitle,
                    UserName = userId,
                    IsPaid = true,
                    IsFulfilled = true,
                    OrderDate = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    Status = "DELIVERED",
                    PaymentStatus = "PAID",
                    FulfillmentStatus = "DELIVERED",
                    TotalAmount = totalAmount,
                    Currency = paymentIntent.Currency?.ToUpperInvariant() ?? "USD",
                    Notes = BuildPaymentNote(request.PaymentIntentId)
                };

                await _orderRepository.CreateOrderAsync(order);
                await MarkSucceededAsync(request.PaymentIntentId, userId, attempts, order.Id);
                await MarkFailureResolvedAsync(request.PaymentIntentId, order.Id);

                return Ok(new ConfirmPaymentIntentResponse
                {
                    OrderId = order.Id.ToString(),
                    Status = "confirmed"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    "Failed to finalize order for payment intent {PaymentIntentId} and user {UserId}",
                    request.PaymentIntentId,
                    userId);

                await MarkFailedAsync(
                    request.PaymentIntentId,
                    userId,
                    attempts,
                    "ORDER_CREATE_FAILED",
                    "We couldn't finalize your order. Please try again or contact support.",
                    ex);

                return StatusCode(StatusCodes.Status500InternalServerError, new ApiErrorResponse
                {
                    Code = "ORDER_CREATE_FAILED",
                    Message = "We couldn't finalize your order. Please try again or contact support.",
                    TraceId = HttpContext.TraceIdentifier
                });
            }
        }

        private async Task MarkSucceededAsync(string paymentIntentId, string userId, int attempts, Guid orderId)
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

            await _finalizationStates.UpdateOneAsync(
                item => item.PaymentIntentId == paymentIntentId,
                update,
                new UpdateOptions { IsUpsert = true });
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

            await _finalizationStates.UpdateOneAsync(
                item => item.PaymentIntentId == paymentIntentId,
                stateUpdate,
                new UpdateOptions { IsUpsert = true });

            var technicalDetails = ex == null
                ? null
                : $"{ex.GetType().Name}: {ex.Message}{Environment.NewLine}{ex.StackTrace}";

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

            await _finalizationFailures.UpdateOneAsync(
                item => item.PaymentIntentId == paymentIntentId,
                failureUpdate,
                new UpdateOptions { IsUpsert = true });
        }

        private async Task MarkFailureResolvedAsync(string paymentIntentId, Guid orderId)
        {
            var update = Builders<PaymentFinalizationFailureDb>.Update
                .Set(item => item.Status, "Resolved")
                .Set(item => item.LastSeenAt, DateTime.UtcNow)
                .Set(item => item.OrderId, orderId);

            await _finalizationFailures.UpdateOneAsync(
                item => item.PaymentIntentId == paymentIntentId,
                update);
        }

        private string GetCurrentUserId()
        {
            return User.FindFirstValue(ClaimTypes.NameIdentifier)
                   ?? User.FindFirstValue("sub")
                   ?? string.Empty;
        }

        private static string BuildPaymentNote(string paymentIntentId) => $"stripe_payment_intent:{paymentIntentId}";
    }

    public static class FinalizationStatus
    {
        public const string Processing = "Processing";
        public const string Succeeded = "Succeeded";
        public const string Failed = "Failed";
    }

    public class CreatePaymentIntentRequest
    {
        public long Amount { get; set; }
        public string Currency { get; set; } = "USD";
        public string? PromoCode { get; set; }
        public List<CreatePaymentIntentItemRequest> Items { get; set; } = new();
    }

    public class CreatePaymentIntentItemRequest
    {
        public string GameId { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public int Quantity { get; set; }
        public decimal UnitPrice { get; set; }
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
