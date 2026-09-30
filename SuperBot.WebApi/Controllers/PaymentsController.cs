using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Stripe;
using SuperBot.Common.Auth;
using SuperBot.Infrastructure.Data;
using SuperBot.Infrastructure.Services;
using SuperBot.WebApi.Services;

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
        private readonly SuperBot.Core.Cashback.ICashbackLedger _cashback;
        private readonly ICashbackCurrency _cashbackCurrency;
        private readonly Microsoft.Extensions.Options.IOptionsMonitor<SuperBot.Core.Cashback.CashbackOptions> _cashbackOptions;
        private readonly IOrderTaxService _tax;
        private readonly SuperBot.WebApi.Services.IBillingCustomers _billingCustomers;
        private readonly IStripeCustomerGateway _stripeCustomers;
        /// <summary>Курсы без наценки — для минимума Stripe в валюте выплат аккаунта.</summary>
        private readonly IFxRateService _fxRates;

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
            ILogger<PaymentsController> logger,
            SuperBot.Core.Cashback.ICashbackLedger cashback,
            ICashbackCurrency cashbackCurrency,
            Microsoft.Extensions.Options.IOptionsMonitor<SuperBot.Core.Cashback.CashbackOptions> cashbackOptions,
            IOrderTaxService tax,
            IFxRateService fxRates,
            SuperBot.WebApi.Services.IBillingCustomers billingCustomers,
            IStripeCustomerGateway stripeCustomers)
        {
            _tax = tax;
            _billingCustomers = billingCustomers;
            _stripeCustomers = stripeCustomers;
            _fxRates = fxRates;
            _cashback = cashback;
            _cashbackCurrency = cashbackCurrency;
            _cashbackOptions = cashbackOptions;
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

            // Запросы одного покупателя — по очереди: иначе второй, пришедший до записи намерения первым, видел кэшбэк уже
            // отложенным и отвечал «0» (см. CheckoutLocks).
            using var checkoutLock = await SuperBot.WebApi.Services.CheckoutLocks.AcquireAsync(userId, HttpContext.RequestAborted);

            // ВАЖНО: из запроса берём только gameId + quantity (+ промокод).
            // Все суммы считает сервер по каталогу — клиентским ценам доверять нельзя.
            var pricing = await _pricing.PriceAsync(new CheckoutPricingRequest
            {
                Items = (request.Items ?? new List<CreatePaymentIntentItemRequest>())
                    .Select(item => new CheckoutPricingItem { GameId = item.GameId, Quantity = item.Quantity, EditionCode = item.EditionCode, OfferKey = item.OfferKey })
                    .ToList(),
                PromoCode = request.PromoCode,
                UserName = userId,
                Currency = request.Currency,
                BuyerCountry = SuperBot.WebApi.Services.Regions.BuyerCountry.Resolve(Request)
            });

            if (!pricing.Success)
            {
                // Код причины — свой у каждой проверки корзины: витрина переводит его на язык покупателя.
                return BadRequest(new ApiErrorResponse
                {
                    Code = pricing.ErrorCode ?? "CHECKOUT_PRICING_FAILED",
                    Message = pricing.Error ?? "Could not price your cart.",
                    Args = pricing.ErrorArgs,
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
                // Оформлен ли заказ без аккаунта — гостевым заказам кэшбэк не начисляется.
                ["guest"] = isAuthenticated ? "false" : "true"
            };

            if (pricing.PromoApplied && !string.IsNullOrWhiteSpace(pricing.NormalizedPromoCode))
            {
                metadata["promoCode"] = pricing.NormalizedPromoCode;
            }

            // Намерение этой кассы решается ОДИН раз и до кэшбэка: переиспользуем только то, что Stripe ещё даёт менять.
            // Раньше резерв ставился под любое незакрытое намерение, и если покупатель уже подтверждал по нему оплату,
            // второй запрос кассы создавал новое намерение и уводил резерв с оплачиваемого — заказ получал скидку,
            // а кэшбэк с баланса не списывался.
            var reusable = await FindUpdatableIntentAsync(userId);
            var checkoutReference = reusable?.Id ?? $"chk_{Guid.NewGuid():N}";

            // Кэшбэк: откладываем под этот платёж ДО расчёта суммы для Stripe — списание должно быть
            // гарантировано к моменту, когда покупатель увидит итог. Ссылка резерва — намерение, которое
            // переиспользуем, или временная, если намерения ещё нет (переносим на новое ниже).
            var cashback = await ApplyCashbackAsync(isAuthenticated, userId, request.UseCashback, pricing, currency, checkoutReference);

            // Налог внутри цены: сумма к оплате от него не меняется, расчёт нужен для показа и заказа. Предварительный —
            // по IP или выбранной стране; окончательный посчитается после оплаты по стране карты. Сбой Stripe Tax
            // оплате не мешает.
            var tax = await _tax.EstimateAsync(new CheckoutTaxRequest
            {
                Currency = currency,
                Items = pricing.Items,
                Total = pricing.Total,
                IpAddress = ClientAddress.Resolve(HttpContext),
                SelectedCountry = pricing.BuyerCountry
            });
            var taxTotal = tax?.Amount ?? 0m;
            if (cashback.Applied > 0)
            {
                metadata["cashbackApplied"] = cashback.Applied.ToString(System.Globalization.CultureInfo.InvariantCulture);
                metadata["cashbackUsd"] = cashback.Usd.ToString(System.Globalization.CultureInfo.InvariantCulture);
            }

            var draft = new PaymentIntentDraft
            {
                // Сумма уже в минорных единицах (центах) — никакого *100 и потери копеек.
                // Часть, оплаченная кэшбэком, картой не списывается.
                AmountMinorUnits = cashback.Applied > 0
                    ? SuperBot.Core.Payments.CurrencyMinorUnits.ToMinor(pricing.Total - cashback.Applied, currency)
                    : pricing.AmountMinorUnits,
                Currency = currency.ToLowerInvariant(),
                Metadata = metadata,
                // Stripe сам пришлёт чек — для гостя это единственная квитанция о покупке.
                ReceiptEmail = userId.Contains('@') ? userId : null,
                // Вошедший платит от своего покупателя Stripe: так карта может сохраниться на следующие покупки,
                // а уже сохранённые появятся в форме. Не вышло завести покупателя — платим без него, касса важнее.
                CustomerId = isAuthenticated ? await TryEnsureStripeCustomerAsync(userId) : null
            };

            // Изменил корзину — обновляем СУЩЕСТВУЮЩЕЕ намерение, а не плодим новые.
            // Раньше каждое изменение создавало новый PaymentIntent: мусор в дашборде и битая воронка.
            PaymentIntentSnapshot paymentIntent;
            try
            {
                paymentIntent = (reusable is null ? null : await UpdateReusableIntentAsync(reusable.Id, userId, draft))
                    // Идемпотентный ключ: если ответ Stripe потерялся в сети и мы повторим запрос,
                    // Stripe вернёт то же намерение, а не создаст второе.
                    ?? await _paymentIntents.CreateAsync(draft, BuildIntentIdempotencyKey(userId, pricing, currency, cashback.Applied, checkoutReference));
            }
            catch when (cashback.Reference != null)
            {
                // Платёж не создался — снимаем отложенный под него кэшбэк сразу, а не через час сборщиком:
                // покупатель наверняка попробует ещё раз, и баланс ему нужен свободным.
                try
                {
                    await _cashback.ReserveAsync(userId, cashback.Reference, 0m);
                }
                catch (Exception releaseError)
                {
                    _logger.LogWarning(releaseError, "Cashback reservation {Reference} could not be released after a failed payment intent.", cashback.Reference);
                }
                throw;
            }

            // Резерв ставился под временную ссылку или под прежнее намерение, а платёж получился другим —
            // переносим, иначе финализация не найдёт, что списывать.
            if (cashback.Reference != null && cashback.Reference != paymentIntent.Id)
            {
                await _cashback.RebindReservationAsync(cashback.Reference, paymentIntent.Id);
            }

            await _finalization.RecordIntentCreatedAsync(new IntentCreatedRecord
            {
                PaymentIntentId = paymentIntent.Id,
                UserId = userId,
                Currency = currency,
                BuyerCountry = pricing.BuyerCountry,
                // Язык сайта у покупателя — в заказ: письма о ключах и возвратах уйдут на нём.
                Language = SuperBot.WebApi.Services.BuyerLanguage.Resolve(Request),
                Subtotal = pricing.Subtotal,
                DiscountTotal = pricing.DiscountTotal,
                TaxTotal = taxTotal,
                Tax = tax?.Tax,
                Total = pricing.Total,
                CashbackApplied = cashback.Applied,
                CashbackUsd = cashback.Usd,
                CheckoutItems = pricing.Items,
                AnalyticsClientId = request?.AnalyticsClientId,
                VisitorId = request?.VisitorId,
                Attribution = request?.Attribution is null
                    ? null
                    : new SuperBot.Core.Entities.OrderAttribution
                    {
                        Source = Trim(request.Attribution.Source),
                        Medium = Trim(request.Attribution.Medium),
                        Campaign = Trim(request.Attribution.Campaign),
                        Referrer = Trim(request.Attribution.Referrer),
                        LandingPath = Trim(request.Attribution.LandingPath),
                        FirstSeenUtc = request.Attribution.FirstSeenUtc
                    }
            });

            // Метки приходят из браузера, то есть от кого угодно: подрезаем длину, чтобы отчёт
            // нельзя было засорить строкой на мегабайт.
            static string? Trim(string? value) =>
                string.IsNullOrWhiteSpace(value) ? null : value.Trim()[..Math.Min(value.Trim().Length, 200)];

            // Ключ сессии покупателя для формы карты: сохранённые карты и галочка «сохранить». Без него форма просто
            // работает как для гостя.
            var customerSessionClientSecret = draft.CustomerId is null
                ? null
                : await TryCreateCustomerSessionAsync(draft.CustomerId, userId);

            return Ok(new
            {
                ClientSecret = paymentIntent.ClientSecret,
                CustomerSessionClientSecret = customerSessionClientSecret,
                // Показывать ли гостю плашку «ключи придут после подтверждения почты»:
                // false для доверенной/проверенной почты — ключи уйдут сразу.
                RequiresEmailVerification = !emailAlreadyVerified,
                Totals = new
                {
                    Subtotal = pricing.Subtotal,
                    Discount = pricing.DiscountTotal,
                    // Налог уже внутри Subtotal и Total — к итогу его не прибавлять.
                    Tax = taxTotal,
                    TaxIncluded = true,
                    Cashback = cashback.Applied,
                    Total = pricing.Total - cashback.Applied
                },
                // Подпись строки налога: «VAT 22%». null — налог не посчитан (выключен, место неизвестно, Stripe не ответил).
                Tax = tax == null || taxTotal <= 0
                    ? null
                    : new
                    {
                        Type = tax.Tax.TaxType,
                        RatePercent = tax.Tax.RatePercent,
                        Country = tax.Tax.Country
                    },
                // Сколько можно было бы списать и сколько списано. Available — весь доступный баланс
                // в валюте заказа, включая отложенное под этот платёж.
                Cashback = new
                {
                    Available = cashback.Available,
                    Applied = cashback.Applied
                },
                Promo = new
                {
                    Applied = pricing.PromoApplied,
                    Code = pricing.NormalizedPromoCode,
                    Message = pricing.PromoMessage,
                    MessageCode = pricing.PromoMessageCode
                }
            });
        }

        /// <summary>
        /// Формулировка согласия, которую витрина обязана показать дословно. Отдаём её с сервера,
        /// чтобы показанное и сохранённое были одним текстом, а не двумя копиями, разъезжающимися
        /// при первой же правке.
        /// </summary>
        [AllowAnonymous]
        [HttpGet("delivery-consent")]
        public ActionResult GetDeliveryConsent() => Ok(new
        {
            version = SuperBot.WebApi.Services.Checkout.DeliveryConsent.CurrentVersion,
            text = SuperBot.WebApi.Services.Checkout.DeliveryConsent.CurrentText
        });

        /// <summary>
        /// Согласие покупателя на немедленную выдачу. Пишется до оплаты и доезжает до заказа.
        /// Гостю тоже доступно: у него нет сессии, а платит он так же.
        /// </summary>
        [AllowAnonymous]
        [HttpPost("delivery-consent")]
        public async Task<ActionResult> RecordDeliveryConsent([FromBody] DeliveryConsentRequest request)
        {
            if (string.IsNullOrWhiteSpace(request?.PaymentIntentId))
            {
                return BadRequest(new { error = "paymentIntentId is required." });
            }

            // Текст берём свой по версии — присланному тексту доверять нельзя.
            if (!SuperBot.WebApi.Services.Checkout.DeliveryConsent.TryGetText(request.Version, out var text))
            {
                return BadRequest(new { error = "Unknown consent version." });
            }

            var recorded = await _finalization.RecordDeliveryConsentAsync(request.PaymentIntentId, request.Version!, text);
            if (!recorded)
            {
                return NotFound(new { error = "Unknown payment intent." });
            }

            return Ok(new { recorded = true, version = request.Version, text });
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
                return StatusCode(StatusCodes.Status429TooManyRequests, SuperBot.WebApi.Services.ApiErrors.Body("payment.verificationCooldown", "Please wait a minute before requesting another email."));
            }

            var token = _verificationTokens.CreateToken(order.Id, order.UserId, TimeSpan.FromHours(48));
            var baseUrl = (_configuration["Mail:PublicBaseUrl"] ?? _configuration["Recovery:PublicBaseUrl"] ?? string.Empty).TrimEnd('/');
            await _deliveryMailer.SendKeyDeliveryVerificationAsync(
                order.UserId,
                order.OrderNumber ?? order.Id.ToString(),
                $"{baseUrl}/api/payments/verify-delivery?token={token}",
                locale: order.Language);

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
                        SuperBot.Core.Interfaces.KeyDeliveryProgress.FromOrder(order),
                        locale: order.Language);
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
                    return NotFound(new ApiErrorResponse
                    {
                        Code = result.ErrorCode ?? "PAYMENT_INTENT_NOT_FOUND",
                        Message = result.ErrorMessage ?? "Payment intent not found.",
                        TraceId = HttpContext.TraceIdentifier
                    });

                case FinalizationOutcome.OwnerMismatch:
                    return Forbid();

                case FinalizationOutcome.NotSucceeded:
                    return BadRequest(new ApiErrorResponse
                    {
                        Code = result.ErrorCode ?? "PAYMENT_NOT_SUCCEEDED",
                        Message = result.ErrorMessage ?? "Payment is not successful yet.",
                        TraceId = HttpContext.TraceIdentifier
                    });

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
        /// Незакрытое намерение покупателя, которое Stripe ещё даёт менять. null — переиспользовать нечего: намерения
        /// нет, оно уже оплачивается/оплачено/отменено или Stripe его не отдал.
        /// </summary>
        private async Task<PaymentIntentSnapshot?> FindUpdatableIntentAsync(string userId)
        {
            var reusableId = await _finalization.FindReusableIntentIdAsync(userId);
            if (string.IsNullOrWhiteSpace(reusableId))
            {
                return null;
            }

            try
            {
                var existing = await _paymentIntents.GetAsync(reusableId);
                // Штатный случай: намерение уже оплачено/отменено — заведём новое.
                return existing is { IsUpdatable: true } ? existing : null;
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

        private async Task<string?> TryEnsureStripeCustomerAsync(string userId)
        {
            try
            {
                return await _billingCustomers.EnsureStripeCustomerAsync(User);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not resolve a Stripe customer for user {UserId}; paying without saved cards.", userId);
                return null;
            }
        }

        private async Task<string?> TryCreateCustomerSessionAsync(string customerId, string userId)
        {
            try
            {
                return await _stripeCustomers.CreateCheckoutSessionSecretAsync(customerId);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not create a Stripe customer session for user {UserId}; the card form will not offer saved cards.", userId);
                return null;
            }
        }

        private async Task<PaymentIntentSnapshot?> UpdateReusableIntentAsync(string reusableId, string userId, PaymentIntentDraft draft)
        {
            try
            {
                return await _paymentIntents.UpdateAsync(reusableId, draft);
            }
            catch (StripeException ex)
            {
                _logger.LogWarning(ex,
                    "Could not update payment intent {PaymentIntentId} for user {UserId} ({ErrorCode}); creating a new one.",
                    reusableId, userId, ex.StripeError?.Code);
                return null;
            }
        }

        /// <summary>
        /// Ключ должен быть ОДИНАКОВЫМ для повтора той же покупки и РАЗНЫМ для другой корзины.
        /// Случайный GUID здесь был бы бесполезен — он не защищает ни от чего.
        /// </summary>
        /// <summary>Сколько кэшбэка доступно и сколько отложено под этот платёж (в валюте заказа и в долларах).</summary>
        private sealed record CashbackCheckout(decimal Available, decimal Applied, decimal Usd, string? Reference)
        {
            public static readonly CashbackCheckout None = new(0m, 0m, 0m, null);
        }

        /// <summary>
        /// Считает и откладывает кэшбэк под оплату. Весь доступный баланс, но так, чтобы картой платилось не
        /// меньше минимума (Stripe не проводит платёж ниже своего порога, а путь без платежа не сделан).
        /// Гостю и при выключенной программе — ничего. Покупатель выключил переключатель — снимаем резерв.
        /// </summary>
        /// <param name="reference">Ссылка резерва: переиспользуемое намерение или временный chk_-ключ этой кассы.</param>
        private async Task<CashbackCheckout> ApplyCashbackAsync(bool isAuthenticated, string userId, bool useCashback, CheckoutPricingResult pricing, string currency, string reference)
        {
            var options = _cashbackOptions.CurrentValue;
            if (!isAuthenticated || !options.Enabled)
            {
                return CashbackCheckout.None;
            }

            var entries = await _cashback.GetEntriesAsync(userId);
            var summary = SuperBot.Core.Cashback.CashbackProjection.Project(entries, DateTime.UtcNow);
            var heldUsd = entries
                .Where(entry => entry.Type == SuperBot.Core.Cashback.CashbackEntryTypes.Spend
                                && entry.Reference == reference
                                && entry.Status == SuperBot.Core.Cashback.CashbackSpendStatuses.Reserved)
                .Sum(entry => entry.AmountUsd);
            var available = _cashbackCurrency.FromUsd(summary.AvailableUsd + heldUsd, currency);
            var configuredMinCard = _cashbackCurrency.FromUsd(options.MinCardPaymentUsd, currency);
            if (available is null || configuredMinCard is null)
            {
                return CashbackCheckout.None; // курса нет — не списываем «на глаз»
            }

            // Не ниже минимума Stripe: настройка в долларах после пересчёта (или ноль из админки) оставляла карте
            // меньше, чем Stripe проводит, и намерение отклонялось уже с отложенным кэшбэком. Минимум Stripe проверяет
            // в валюте выплат аккаунта: у аккаунта в евро $0.50 — это €0.44, меньше его €0.50.
            var minCard = Math.Max(configuredMinCard.Value, await StripeMinimumAsync(currency));
            var maxApplicable = pricing.Total - minCard;
            if (!useCashback || maxApplicable <= 0 || available <= 0)
            {
                if (heldUsd > 0)
                {
                    await _cashback.ReserveAsync(userId, reference, 0m);
                }
                return new CashbackCheckout(available.Value, 0m, 0m, null);
            }

            // Центы вниз: округление вверх отложило бы на долю цента больше, чем покрывает заказ.
            var requestedUsd = Math.Floor((_cashbackCurrency.ToUsd(maxApplicable, currency) ?? 0m) * 100m) / 100m;
            var reservedUsd = await _cashback.ReserveAsync(userId, reference, requestedUsd);
            if (reservedUsd <= 0)
            {
                return new CashbackCheckout(available.Value, 0m, 0m, null);
            }

            var applied = Math.Min(maxApplicable, _cashbackCurrency.FromUsd(reservedUsd, currency) ?? 0m);
            return new CashbackCheckout(available.Value, applied, reservedUsd, reference);
        }

        /// <summary>
        /// Минимум платежа Stripe в валюте заказа с учётом валюты выплат аккаунта. Stripe не ответил про аккаунт —
        /// порог валюты заказа с двойным запасом: лишние центы на карту лучше отклонённого платежа.
        /// </summary>
        private async Task<decimal> StripeMinimumAsync(string currency)
        {
            string? settlement;
            try
            {
                settlement = await _paymentIntents.GetSettlementCurrencyAsync();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Stripe account currency is unknown; the card minimum is doubled for safety.");
                settlement = null;
            }

            return settlement is null
                ? SuperBot.Core.Payments.StripeMinimumCharge.For(currency) * SuperBot.Core.Payments.StripeMinimumCharge.UnknownRateMultiplier
                : SuperBot.Core.Payments.StripeMinimumCharge.For(currency, settlement, _fxRates.Current());
        }

        private static string BuildIntentIdempotencyKey(string userId, CheckoutPricingResult pricing, string currency, decimal cashbackApplied, string checkoutReference)
        {
            var items = string.Join(",", pricing.Items
                .OrderBy(item => item.GameId, StringComparer.Ordinal)
                .Select(item => $"{item.GameId}:{item.Quantity}"));
            // Кэшбэк меняет сумму к списанию — это другой платёж, а не повтор того же запроса.
            // Ссылка кассы делает ключ уникальным для каждой новой кассы: без неё покупатель, купивший ту же корзину
            // второй раз за сутки, получал от Stripe прежнее, уже оплаченное намерение и «PaymentIntent has already
            // succeeded». Повтор того же запроса в сети (ретраи SDK) идёт с тем же ключом и остаётся идемпотентным.
            var payload = $"{userId}|{currency}|{pricing.AmountMinorUnits}|{pricing.NormalizedPromoCode}|{items}|cb:{cashbackApplied}|ref:{checkoutReference}";

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
                && order.PaymentStatus.ToUpperInvariant() is "REFUNDED" or "REFUND_PENDING" or "PARTIALLY_REFUNDED" or "DISPUTE_LOST");

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
                .Select(key =>
                {
                    // Тип товара, игра и издание — как при первой выдаче: по ним письмо подписывает ключ ПО
                    // лицензией и местом активации.
                    var item = gameIds[key.GameId!];
                    return new SuperBot.Core.Interfaces.DeliveredKeyNotification(
                        item.Title ?? "Game purchase", key.Key, key.KeyType, item.ProductType, item.GameId, item.EditionCode);
                })
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
        /// <summary>
        /// Идентификатор посетителя в Google Analytics (куки _ga), снятый браузером при
        /// оформлении. Сервер сам его получить не может — куки принадлежат домену Google.
        /// Пусто, когда аналитика выключена или согласия на куки не было.
        /// </summary>
        public string? AnalyticsClientId { get; set; }

        /// <summary>Свой идентификатор посетителя — тот же, которым помечены события воронки.</summary>
        public string? VisitorId { get; set; }

        /// <summary>
        /// Первое касание: как посетитель нашёл магазин. Снимает браузер при первом заходе —
        /// сервер этих данных не видит, потому что метки и переход остаются в адресной строке
        /// и заголовке referrer той страницы, а не запроса на оплату.
        /// </summary>
        public OrderAttributionRequest? Attribution { get; set; }

        public string? PromoCode { get; set; }

        /// <summary>Оплатить часть заказа кэшбэком. Сколько именно — решает сервер: весь доступный баланс, но картой не меньше минимума.</summary>
        public bool UseCashback { get; set; }

        public List<CreatePaymentIntentItemRequest> Items { get; set; } = new();

        /// <summary>
        /// Валюта, выбранная покупателем. Не сумма, а только валюта: цены всё равно берутся
        /// из каталога. Неподдерживаемое значение молча станет базовой валютой.
        /// </summary>
        public string? Currency { get; set; }

        /// <summary>Email гостя (без логина): туда уходят чек, письмо подтверждения и ключи.</summary>
        public string? Email { get; set; }
    }

    /// <summary>Первое касание, снятое браузером. Все поля необязательны.</summary>
    public class OrderAttributionRequest
    {
        public string? Source { get; set; }
        public string? Medium { get; set; }
        public string? Campaign { get; set; }
        public string? Referrer { get; set; }
        public string? LandingPath { get; set; }
        public DateTime? FirstSeenUtc { get; set; }
    }

    public class CreatePaymentIntentItemRequest
    {
        public string GameId { get; set; } = string.Empty;
        public int Quantity { get; set; }
        public string? EditionCode { get; set; }
        /// <summary>Выбранный на витрине региональный вариант ключа; пусто — вариантов не было.</summary>
        public string? OfferKey { get; set; }
    }

    public class ConfirmPaymentIntentRequest
    {
        public string PaymentIntentId { get; set; } = string.Empty;
    }

    public class DeliveryConsentRequest
    {
        public string? PaymentIntentId { get; set; }

        /// <summary>Версия показанного текста. Сам текст сервер подставляет свой.</summary>
        public string? Version { get; set; }
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
        /// <summary>Подстановки для перевода по коду на витрине («{{title}}», «{{max}}»).</summary>
        public object? Args { get; set; }
    }
}
