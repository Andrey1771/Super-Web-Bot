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
        private readonly ILogger<PaymentsController> _logger;

        public PaymentsController(
            IOrderFinalizationService finalization,
            ICheckoutPricingService pricing,
            ILogger<PaymentsController> logger)
        {
            _finalization = finalization;
            _pricing = pricing;
            _logger = logger;
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

            var service = new PaymentIntentService();

            // Изменил корзину — обновляем СУЩЕСТВУЮЩЕЕ намерение, а не плодим новые.
            // Раньше каждое изменение создавало новый PaymentIntent: мусор в дашборде и битая воронка.
            var paymentIntent = await TryUpdateReusableIntentAsync(service, userId, pricing, currency, metadata);

            if (paymentIntent == null)
            {
                var options = new PaymentIntentCreateOptions
                {
                    // Сумма уже в минорных единицах (центах) — никакого *100 и потери копеек.
                    Amount = pricing.AmountMinorUnits,
                    Currency = currency.ToLowerInvariant(),
                    Metadata = metadata,
                    AutomaticPaymentMethods = new PaymentIntentAutomaticPaymentMethodsOptions { Enabled = true }
                };

                // Идемпотентный ключ: если ответ Stripe потерялся в сети и мы повторим запрос,
                // Stripe вернёт то же намерение, а не создаст второе.
                var requestOptions = new RequestOptions
                {
                    IdempotencyKey = BuildIntentIdempotencyKey(userId, pricing, currency)
                };

                paymentIntent = await service.CreateAsync(options, requestOptions);
            }

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

        /// <summary>
        /// Статусы, в которых сумму намерения ещё можно менять. Всё остальное
        /// (succeeded / processing / canceled) означает, что нужно новое намерение.
        /// </summary>
        private static bool IsUpdatable(string? status) =>
            status is "requires_payment_method" or "requires_confirmation" or "requires_action";

        private async Task<PaymentIntent?> TryUpdateReusableIntentAsync(
            PaymentIntentService service,
            string userId,
            CheckoutPricingResult pricing,
            string currency,
            Dictionary<string, string> metadata)
        {
            var reusableId = await _finalization.FindReusableIntentIdAsync(userId);
            if (string.IsNullOrWhiteSpace(reusableId))
            {
                return null;
            }

            try
            {
                var existing = await service.GetAsync(reusableId);
                if (existing == null || !IsUpdatable(existing.Status))
                {
                    // Штатный случай: намерение уже оплачено/отменено — заведём новое.
                    return null;
                }

                return await service.UpdateAsync(reusableId, new PaymentIntentUpdateOptions
                {
                    Amount = pricing.AmountMinorUnits,
                    Currency = currency.ToLowerInvariant(),
                    Metadata = metadata
                });
            }
            catch (StripeException ex)
            {
                // Намерение удалено/недоступно — покупателя это ломать не должно, создадим новое.
                // Но молчать нельзя: если переиспользование ломается систематически (не тот ключ,
                // урезаны права, лимиты), мы тихо вернёмся к созданию лишних намерений на каждое
                // изменение корзины — ровно к той проблеме, ради которой это и делалось.
                _logger.LogWarning(ex,
                    "Could not reuse payment intent {PaymentIntentId} for user {UserId} ({ErrorCode}); creating a new one.",
                    reusableId, userId, ex.StripeError?.Code);
                return null;
            }
        }

        /// <summary>
        /// Ключ должен быть ОДИНАКОВЫМ для повтора той же покупки и РАЗНЫМ для другой корзины.
        /// Случайный GUID здесь был бы бесполезен — он не защищает ни от чего.
        /// </summary>
        private static string BuildIntentIdempotencyKey(string userId, CheckoutPricingResult pricing, string currency)
        {
            var items = string.Join(",", pricing.Items
                .OrderBy(item => item.GameId, StringComparer.Ordinal)
                .Select(item => $"{item.GameId}:{item.Quantity}"));
            var payload = $"{userId}|{currency}|{pricing.AmountMinorUnits}|{pricing.NormalizedPromoCode}|{items}";

            var hash = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(payload));
            return $"pi_create_{Convert.ToHexString(hash)[..32].ToLowerInvariant()}";
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
