using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
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
        private readonly SuperBot.Core.Interfaces.IRepositories.IOrderRepository _orderRepository;
        private readonly SuperBot.Core.Interfaces.IRepositories.IGameKeyRepository _gameKeys;
        private readonly SuperBot.Core.Interfaces.IKeyFulfillmentService _keyFulfillment;
        private readonly SuperBot.Core.Interfaces.IDeliveryMailer _deliveryMailer;
        private readonly IDeliveryVerificationTokenService _verificationTokens;
        private readonly IConfiguration _configuration;
        private readonly Microsoft.Extensions.Caching.Memory.IMemoryCache _memoryCache;
        private readonly ILogger<PaymentsController> _logger;

        public PaymentsController(
            IOrderFinalizationService finalization,
            ICheckoutPricingService pricing,
            IStripePaymentIntentGateway paymentIntents,
            SuperBot.Core.Interfaces.IRepositories.IOrderRepository orderRepository,
            SuperBot.Core.Interfaces.IRepositories.IGameKeyRepository gameKeys,
            SuperBot.Core.Interfaces.IKeyFulfillmentService keyFulfillment,
            SuperBot.Core.Interfaces.IDeliveryMailer deliveryMailer,
            IDeliveryVerificationTokenService verificationTokens,
            IConfiguration configuration,
            Microsoft.Extensions.Caching.Memory.IMemoryCache memoryCache,
            ILogger<PaymentsController> logger)
        {
            _finalization = finalization;
            _pricing = pricing;
            _paymentIntents = paymentIntents;
            _orderRepository = orderRepository;
            _gameKeys = gameKeys;
            _keyFulfillment = keyFulfillment;
            _deliveryMailer = deliveryMailer;
            _verificationTokens = verificationTokens;
            _configuration = configuration;
            _memoryCache = memoryCache;
            _logger = logger;
        }

        /// <summary>
        /// Гостевая покупка разрешена: залогиненный опознаётся по Keycloak-клеймам,
        /// гость — по email из запроса. Ключи гостю выдаются только после подтверждения почты.
        /// </summary>
        [AllowAnonymous]
        [HttpPost("create-payment-intent")]
        public async Task<ActionResult> CreatePaymentIntent([FromBody] CreatePaymentIntentRequest request)
        {
            var isAuthenticated = User?.Identity?.IsAuthenticated == true;
            var userId = isAuthenticated ? GetCurrentUserId() : NormalizeGuestEmail(request.Email);
            if (string.IsNullOrWhiteSpace(userId))
            {
                if (isAuthenticated)
                {
                    return Unauthorized();
                }

                return BadRequest(new ApiErrorResponse
                {
                    Code = "GUEST_EMAIL_REQUIRED",
                    Message = "Enter a valid email — we'll send your keys and receipt there.",
                    TraceId = HttpContext.TraceIdentifier
                });
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

            // Нужно ли гонять эту почту через подтверждение перед выдачей ключей.
            // У залогиненных email уже проверен Keycloak'ом. Гостю подтверждение НЕ требуется,
            // если эта почта уже проходила подтверждение в прошлом успешном заказе (доверенная).
            var emailAlreadyVerified = isAuthenticated
                || await _orderRepository.HasVerifiedDeliveryEmailAsync(userId);

            // Валюта — из расчёта сервера, не из запроса.
            var currency = pricing.Currency;
            var firstItem = pricing.Items.First();
            var metadata = new Dictionary<string, string>
            {
                ["userId"] = userId,
                ["itemCount"] = pricing.Items.Count.ToString(),
                ["firstItemGameId"] = firstItem.GameId ?? string.Empty,
                ["firstItemTitle"] = firstItem.Title,
                ["currency"] = currency,
                // По этой метке финализация решает, придержать ли ключи до подтверждения почты.
                ["emailVerified"] = emailAlreadyVerified ? "true" : "false",
                // Кэшбэк копят только залогиненные (у гостя userId — это email, не аккаунт).
                ["cashbackEligible"] = isAuthenticated ? "true" : "false"
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
                Metadata = metadata,
                // Stripe сам пришлёт чек — для гостя это единственная квитанция о покупке.
                ReceiptEmail = userId.Contains('@') ? userId : null
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
                // Показывать ли гостю плашку «ключи придут после подтверждения почты»:
                // false для доверенной/проверенной почты — ключи уйдут сразу.
                RequiresEmailVerification = !emailAlreadyVerified,
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

        [AllowAnonymous]
        [HttpPost("confirm-payment-intent")]
        public async Task<ActionResult<ConfirmPaymentIntentResponse>> ConfirmPaymentIntent([FromBody] ConfirmPaymentIntentRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.PaymentIntentId))
            {
                return BadRequest("paymentIntentId is required.");
            }

            // У гостя сессии нет — гард владельца не применяем (как и в вебхуке):
            // владельца финализация всё равно берёт из метаданных намерения, а сам факт
            // оплаты перепроверяется у Stripe, так что «подтвердить чужое» ничего не даёт.
            var isAuthenticated = User?.Identity?.IsAuthenticated == true;

            var result = await _finalization.FinalizeAsync(new OrderFinalizationRequest
            {
                PaymentIntentId = request.PaymentIntentId,
                ExpectedUserId = isAuthenticated ? GetCurrentUserId() : null,
                TraceId = HttpContext.TraceIdentifier,
                Source = "confirm"
            });

            return MapFinalizationResult(result);
        }

        /// <summary>
        /// «Не пришло письмо?» — повторная отправка подтверждения с НОВЫМ токеном (старый мог
        /// протухнуть, TTL 48ч). Письмо уходит ТОЛЬКО на адрес, сохранённый в заказе, — сменить
        /// почту самообслуживанием нельзя, иначе это способ увести чужие ключи.
        /// PaymentIntentId неугадываем и известен только покупателю, но от спама стоит кулдаун.
        /// </summary>
        [AllowAnonymous]
        [HttpPost("resend-verification")]
        public async Task<IActionResult> ResendVerification([FromBody] ResendVerificationRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.PaymentIntentId))
            {
                return BadRequest("paymentIntentId is required.");
            }

            var order = await _orderRepository.GetByPaymentIntentIdAsync(request.PaymentIntentId);
            if (order == null)
            {
                return NotFound();
            }

            if (!order.RequiresDeliveryVerification)
            {
                return Ok(new { resent = false, alreadyVerified = true });
            }

            var cooldownKey = $"resend-verification:{request.PaymentIntentId}";
            if (_memoryCache.TryGetValue(cooldownKey, out _))
            {
                return StatusCode(StatusCodes.Status429TooManyRequests, new { message = "Please wait a minute before requesting another email." });
            }

            var token = _verificationTokens.CreateToken(order.Id, order.UserId, TimeSpan.FromHours(48));
            var baseUrl = (_configuration["Mail:PublicBaseUrl"] ?? _configuration["Recovery:PublicBaseUrl"] ?? string.Empty).TrimEnd('/');
            await _deliveryMailer.SendKeyDeliveryVerificationAsync(
                order.UserId,
                order.OrderNumber ?? order.Id.ToString(),
                $"{baseUrl}/api/payments/verify-delivery?token={token}");

            _memoryCache.Set(cooldownKey, true, TimeSpan.FromSeconds(60));
            return Ok(new { resent = true });
        }

        /// <summary>
        /// Ссылка из письма гостю: подтверждает почту и выдаёт придержанные ключи.
        /// Аутентификация — HMAC-токен из письма; повторный переход безопасен (выдача идемпотентна).
        /// </summary>
        [AllowAnonymous]
        [HttpGet("verify-delivery")]
        public async Task<IActionResult> VerifyDelivery([FromQuery] string token)
        {
            var baseUrl = (_configuration["Mail:PublicBaseUrl"] ?? _configuration["Recovery:PublicBaseUrl"] ?? string.Empty).TrimEnd('/');
            IActionResult RedirectToResult(string status, string? orderNumber = null) =>
                Redirect($"{baseUrl}/delivery-confirmed?status={status}{(orderNumber is null ? string.Empty : $"&order={Uri.EscapeDataString(orderNumber)}")}");

            if (!_verificationTokens.TryValidate(token, out var orderId, out var email))
            {
                return RedirectToResult("invalid");
            }

            var order = await _orderRepository.GetOrderByIdAsync(orderId.ToString());
            if (order == null || !order.IsPaid
                || !string.Equals(order.UserId, email, StringComparison.OrdinalIgnoreCase))
            {
                return RedirectToResult("invalid");
            }

            // Заказ уже возвращён (авто-возврат за 48ч или вручную) — ключи НЕ выдаём никогда.
            if (IsRefunded(order))
            {
                return RedirectToResult("refunded", order.OrderNumber);
            }

            // Подтверждение — АТОМАРНЫЙ переход (только пока заказ PAID): исключает гонку
            // с авто-возвратом. Проигрыш = sweeper успел занять заказ под возврат.
            if (order.RequiresDeliveryVerification)
            {
                var confirmed = await _orderRepository.TryConfirmDeliveryVerificationAsync(order.Id.ToString());
                if (confirmed == null)
                {
                    order = await _orderRepository.GetOrderByIdAsync(orderId.ToString());
                    if (order == null || IsRefunded(order))
                    {
                        return RedirectToResult("refunded", order?.OrderNumber);
                    }
                    // Иначе — параллельный клик по той же ссылке уже подтвердил; продолжаем со свежей копией.
                }
                else
                {
                    order = confirmed;
                }
            }

            var delivered = await _keyFulfillment.FulfillOrderAsync(order);

            // Ключи могли быть выданы раньше без письма (например, бэкфилл сработал до клика по ссылке,
            // пока письма из бэкфилла ещё не отправлялись) — досылаем их из хранилища ключей.
            if (delivered.Count == 0 && order.IsFulfilled)
            {
                delivered = await CollectOrderKeysForResendAsync(order, email);
            }

            if (delivered.Count > 0)
            {
                try
                {
                    await _deliveryMailer.SendGameKeysAsync(email, order.OrderNumber ?? order.Id.ToString(), delivered,
                        SuperBot.Core.Interfaces.KeyDeliveryReceipt.FromOrder(order),
                        SuperBot.Core.Interfaces.KeyDeliveryProgress.FromOrder(order));
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Keys email failed after verification for order {OrderId} ({Email}).", order.Id, email);
                }
            }

            // pending: почта подтверждена, но пул ключей пуст — доложит бэкфилл при пополнении.
            return RedirectToResult(order.IsFulfilled ? "ok" : "pending", order.OrderNumber);
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
                        Status = result.StatusLabel ?? "confirmed",
                        RequiresEmailVerification = result.RequiresEmailVerification,
                        BuyerEmail = result.BuyerEmail
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

        /// <summary>Возврат состоялся или занят sweeper'ом — выдача ключей исключена.</summary>
        private static bool IsRefunded(SuperBot.Core.Entities.Order order) =>
            string.Equals(order.Status, "REFUNDED", StringComparison.OrdinalIgnoreCase)
            || (order.PaymentStatus != null
                && order.PaymentStatus.ToUpperInvariant() is "REFUNDED" or "REFUND_PENDING" or "PARTIALLY_REFUNDED");

        /// <summary>
        /// Досылка при повторном/позднем подтверждении: ключи заказа уже выданы (лежат в GameKeys
        /// на email покупателя), но письмо с ними не уходило. Полные ключи в снапшоте заказа
        /// замаскированы — берём их из хранилища, отфильтровав по играм заказа.
        /// </summary>
        private async Task<IReadOnlyList<SuperBot.Core.Interfaces.DeliveredKeyNotification>> CollectOrderKeysForResendAsync(
            SuperBot.Core.Entities.Order order, string email)
        {
            var gameIds = (order.Items ?? new List<SuperBot.Core.Entities.OrderItemSnapshot>())
                .Where(item => !string.IsNullOrWhiteSpace(item.GameId))
                .ToDictionary(item => item.GameId!, item => item, StringComparer.OrdinalIgnoreCase);
            if (gameIds.Count == 0)
            {
                return Array.Empty<SuperBot.Core.Interfaces.DeliveredKeyNotification>();
            }

            var userKeys = await _gameKeys.GetByUserAsync(email, 100);
            return userKeys
                .Where(key => key.GameId != null && gameIds.ContainsKey(key.GameId))
                .Select(key => new SuperBot.Core.Interfaces.DeliveredKeyNotification(
                    gameIds[key.GameId!].Title ?? "Game purchase", key.Key, key.KeyType))
                .ToList();
        }

        /// <summary>
        /// Email гостя = его идентичность: на него выдаются ключи и позже «подхватывается» аккаунт
        /// с тем же адресом. Поэтому нормализуем жёстко (trim + lower), а мусор отклоняем.
        /// </summary>
        private static string? NormalizeGuestEmail(string? email)
        {
            var trimmed = email?.Trim();
            if (string.IsNullOrWhiteSpace(trimmed) || trimmed.Length > 254)
            {
                return null;
            }

            return System.Net.Mail.MailAddress.TryCreate(trimmed, out var parsed)
                ? parsed.Address.ToLowerInvariant()
                : null;
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

        /// <summary>Email гостя (без логина): туда уходят чек, письмо подтверждения и ключи.</summary>
        public string? Email { get; set; }
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

    public class ResendVerificationRequest
    {
        public string PaymentIntentId { get; set; } = string.Empty;
    }

    public class ConfirmPaymentIntentResponse
    {
        public string OrderId { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;

        /// <summary>true для гостя: ключи придут после подтверждения почты по ссылке из письма.</summary>
        public bool RequiresEmailVerification { get; set; }

        /// <summary>Адрес, куда ушло письмо подтверждения (показывается покупателю).</summary>
        public string? BuyerEmail { get; set; }
    }

    public class ApiErrorResponse
    {
        public string Message { get; set; } = string.Empty;
        public string TraceId { get; set; } = string.Empty;
        public string Code { get; set; } = string.Empty;
    }
}
