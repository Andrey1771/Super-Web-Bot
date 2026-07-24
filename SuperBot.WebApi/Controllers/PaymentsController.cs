using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Stripe;
using SuperBot.Common.Auth;
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
        private readonly IStripePaymentIntentGateway _paymentIntents;
        private readonly ILogger<PaymentsController> _logger;

        public PaymentsController(
            IOrderFinalizationService finalization,
            ICheckoutPricingService pricing,
            IStripePaymentIntentGateway paymentIntents,
            ILogger<PaymentsController> logger)
        {
            _finalization = finalization;
            _pricing = pricing;
            _paymentIntents = paymentIntents;
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

            var draft = new PaymentIntentDraft
            {
                // Сумма уже в минорных единицах (центах) — никакого *100 и потери копеек.
                AmountMinorUnits = pricing.AmountMinorUnits,
                Currency = currency.ToLowerInvariant(),
                Metadata = metadata
            };

            // Изменил корзину — обновляем СУЩЕСТВУЮЩЕЕ намерение, а не плодим новые.
            // Раньше каждое изменение создавало новый PaymentIntent: мусор в дашборде и битая воронка.
            var paymentIntent = await TryUpdateReusableIntentAsync(userId, draft);

            // Идемпотентный ключ: если ответ Stripe потерялся в сети и мы повторим запрос,
            // Stripe вернёт то же намерение, а не создаст второе.
            paymentIntent ??= await _paymentIntents.CreateAsync(draft, BuildIntentIdempotencyKey(userId, pricing, currency));

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

        private async Task<PaymentIntentSnapshot?> TryUpdateReusableIntentAsync(string userId, PaymentIntentDraft draft)
        {
            var reusableId = await _finalization.FindReusableIntentIdAsync(userId);
            if (string.IsNullOrWhiteSpace(reusableId))
            {
                return null;
            }

            try
            {
                var existing = await _paymentIntents.GetAsync(reusableId);
                if (existing == null || !existing.IsUpdatable)
                {
                    // Штатный случай: намерение уже оплачено/отменено — заведём новое.
                    return null;
                }

                return await _paymentIntents.UpdateAsync(reusableId, draft);
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

        /// <summary>
        /// ВАЖНО: та же идентификация, что и во всём остальном приложении (кабинет, вишлист, блог).
        /// Раньше здесь брался sub, а `/api/users/me/keys` искал по email — из-за чего выданный
        /// ключ не отображался в «Keys &amp; activation».
        /// </summary>
        private string GetCurrentUserId() => User.GetUserKey();
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
