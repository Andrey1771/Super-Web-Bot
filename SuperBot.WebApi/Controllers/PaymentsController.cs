using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Stripe;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class PaymentsController : ControllerBase
    {
        private readonly IOrderRepository _orderRepository;
        private readonly ILogger<PaymentsController> _logger;

        public PaymentsController(IOrderRepository orderRepository, ILogger<PaymentsController> logger)
        {
            _orderRepository = orderRepository;
            _logger = logger;
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

            try
            {
                var paymentIntentService = new PaymentIntentService();
                var paymentIntent = await paymentIntentService.GetAsync(request.PaymentIntentId);
                if (paymentIntent == null)
                {
                    return NotFound("Payment intent not found.");
                }

                var metadataUserId = paymentIntent.Metadata.TryGetValue("userId", out var storedUserId)
                    ? storedUserId
                    : string.Empty;

                if (!string.IsNullOrWhiteSpace(metadataUserId) && !string.Equals(metadataUserId, userId, StringComparison.OrdinalIgnoreCase))
                {
                    return Forbid();
                }

                if (!string.Equals(paymentIntent.Status, "succeeded", StringComparison.OrdinalIgnoreCase))
                {
                    return BadRequest($"Payment is not successful yet. Status: {paymentIntent.Status}.");
                }

                var existing = (await _orderRepository.GetOrdersByUserAsync(userId))
                    .FirstOrDefault(order => string.Equals(order.Notes, BuildPaymentNote(request.PaymentIntentId), StringComparison.OrdinalIgnoreCase));

                if (existing != null)
                {
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

                return StatusCode(StatusCodes.Status500InternalServerError, new ApiErrorResponse
                {
                    Code = "ORDER_CREATE_FAILED",
                    Message = "We couldn't finalize your order. Please try again or contact support.",
                    TraceId = HttpContext.TraceIdentifier
                });
            }
        }

        private string GetCurrentUserId()
        {
            return User.FindFirstValue(ClaimTypes.NameIdentifier)
                   ?? User.FindFirstValue("sub")
                   ?? string.Empty;
        }

        private static string BuildPaymentNote(string paymentIntentId) => $"stripe_payment_intent:{paymentIntentId}";
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
