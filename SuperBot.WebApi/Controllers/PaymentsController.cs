using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Stripe;
using SuperBot.Infrastructure.Data;
using SuperBot.Infrastructure.Services;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class PaymentsController : ControllerBase
    {
        private readonly IOrderFinalizationService _finalization;
        private readonly ICheckoutPricingService _pricing;

        public PaymentsController(IOrderFinalizationService finalization, ICheckoutPricingService pricing)
        {
            _finalization = finalization;
            _pricing = pricing;
        }

        [HttpPost("create-payment-intent")]
        public async Task<ActionResult> CreatePaymentIntent([FromBody] CreatePaymentIntentRequest request)
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrWhiteSpace(userId))
            {
                return Unauthorized();
            }

            // ВАЖНО: из запроса берём только gameId + quantity (+ промокод).
            // Все суммы считает сервер по каталогу — клиентским ценам доверять нельзя.
            var pricing = await _pricing.PriceAsync(new CheckoutPricingRequest
            {
                Items = (request.Items ?? new List<CreatePaymentIntentItemRequest>())
                    .Select(item => new CheckoutPricingItem { GameId = item.GameId, Quantity = item.Quantity })
                    .ToList(),
                PromoCode = request.PromoCode,
                UserName = userId
            });

            if (!pricing.Success)
            {
                return BadRequest(new ApiErrorResponse
                {
                    Code = "CHECKOUT_PRICING_FAILED",
                    Message = pricing.Error ?? "Could not price your cart.",
                    TraceId = HttpContext.TraceIdentifier
                });
            }

            // Валюта — из расчёта сервера, не из запроса.
            var currency = pricing.Currency;
            var firstItem = pricing.Items.First();
            var metadata = new Dictionary<string, string>
            {
                ["userId"] = userId,
                ["itemCount"] = pricing.Items.Count.ToString(),
                ["firstItemGameId"] = firstItem.GameId ?? string.Empty,
                ["firstItemTitle"] = firstItem.Title,
                ["currency"] = currency
            };

            if (pricing.PromoApplied && !string.IsNullOrWhiteSpace(pricing.NormalizedPromoCode))
            {
                metadata["promoCode"] = pricing.NormalizedPromoCode;
            }

            var options = new PaymentIntentCreateOptions
            {
                // Сумма уже в минорных единицах (центах) — никакого *100 и потери копеек.
                Amount = pricing.AmountMinorUnits,
                Currency = currency.ToLowerInvariant(),
                Metadata = metadata,
                AutomaticPaymentMethods = new PaymentIntentAutomaticPaymentMethodsOptions { Enabled = true }
            };

            var service = new PaymentIntentService();
            var paymentIntent = service.Create(options);

            await _finalization.RecordIntentCreatedAsync(new IntentCreatedRecord
            {
                PaymentIntentId = paymentIntent.Id,
                UserId = userId,
                Currency = currency,
                Subtotal = pricing.Subtotal,
                DiscountTotal = pricing.DiscountTotal,
                TaxTotal = pricing.TaxTotal,
                Total = pricing.Total,
                CheckoutItems = pricing.Items
            });

            return Ok(new
            {
                ClientSecret = paymentIntent.ClientSecret,
                Totals = new
                {
                    Subtotal = pricing.Subtotal,
                    Discount = pricing.DiscountTotal,
                    Tax = pricing.TaxTotal,
                    Total = pricing.Total
                },
                Promo = new
                {
                    Applied = pricing.PromoApplied,
                    Code = pricing.NormalizedPromoCode,
                    Message = pricing.PromoMessage
                }
            });
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

            var result = await _finalization.FinalizeAsync(new OrderFinalizationRequest
            {
                PaymentIntentId = request.PaymentIntentId,
                ExpectedUserId = userId,
                TraceId = HttpContext.TraceIdentifier,
                Source = "confirm"
            });

            return MapFinalizationResult(result);
        }

        private ActionResult MapFinalizationResult(OrderFinalizationResult result)
        {
            switch (result.Outcome)
            {
                case FinalizationOutcome.Confirmed:
                case FinalizationOutcome.AlreadyConfirmed:
                    return Ok(new ConfirmPaymentIntentResponse
                    {
                        OrderId = result.OrderId ?? string.Empty,
                        Status = result.StatusLabel ?? "confirmed"
                    });

                case FinalizationOutcome.Processing:
                    return StatusCode(StatusCodes.Status409Conflict, new ApiErrorResponse
                    {
                        Code = result.ErrorCode ?? "FINALIZATION_ALREADY_PROCESSING",
                        Message = result.ErrorMessage ?? "Your payment is already being processed.",
                        TraceId = HttpContext.TraceIdentifier
                    });

                case FinalizationOutcome.AttemptsExceeded:
                    return StatusCode(StatusCodes.Status429TooManyRequests, new ApiErrorResponse
                    {
                        Code = result.ErrorCode ?? "FINALIZATION_ATTEMPTS_EXCEEDED",
                        Message = result.ErrorMessage ?? "We couldn't finalize your order yet.",
                        TraceId = HttpContext.TraceIdentifier
                    });

                case FinalizationOutcome.NotFound:
                    return NotFound(result.ErrorMessage ?? "Payment intent not found.");

                case FinalizationOutcome.OwnerMismatch:
                    return Forbid();

                case FinalizationOutcome.NotSucceeded:
                    return BadRequest(result.ErrorMessage ?? "Payment is not successful yet.");

                default:
                    return StatusCode(StatusCodes.Status500InternalServerError, new ApiErrorResponse
                    {
                        Code = result.ErrorCode ?? "ORDER_CREATE_FAILED",
                        Message = result.ErrorMessage ?? "We couldn't finalize your order. Please try again or contact support.",
                        TraceId = HttpContext.TraceIdentifier
                    });
            }
        }

        private string GetCurrentUserId()
        {
            return User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? string.Empty;
        }
    }

    /// <summary>
    /// Контракт намеренно НЕ содержит сумм: клиент сообщает только что и сколько покупает.
    /// Любые money-поля здесь снова открыли бы подмену цены.
    /// </summary>
    public class CreatePaymentIntentRequest
    {
        public string? PromoCode { get; set; }
        public List<CreatePaymentIntentItemRequest> Items { get; set; } = new();
    }

    public class CreatePaymentIntentItemRequest
    {
        public string GameId { get; set; } = string.Empty;
        public int Quantity { get; set; }
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
