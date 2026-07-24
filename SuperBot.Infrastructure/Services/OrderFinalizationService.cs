using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using Stripe;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Services
{
    /// <summary>
    /// Единое ядро финализации Stripe-платежа: создать заказ и выдать ключи идемпотентно.
    /// Раньше жило внутри PaymentsController.ConfirmPaymentIntent; вынесено, чтобы ТУ ЖЕ логику
    /// мог дёргать Stripe-вебхук (server-side финализация, если клиент закрыл вкладку до confirm).
    /// Возвращает структурированный результат — HTTP-маппинг делает вызывающий контроллер.
    /// </summary>
    public interface IOrderFinalizationService
    {
        /// <summary>Пишет начальное состояние (Created) при создании PaymentIntent.</summary>
        Task RecordIntentCreatedAsync(IntentCreatedRecord record);

        /// <summary>
        /// Последнее ещё не оплаченное намерение пользователя — его можно обновить вместо
        /// создания нового при каждом изменении корзины.
        /// </summary>
        Task<string?> FindReusableIntentIdAsync(string userId);

        /// <summary>Идемпотентно финализирует платёж: создаёт заказ + выдаёт ключи.</summary>
        Task<OrderFinalizationResult> FinalizeAsync(OrderFinalizationRequest request);
    }

    public class IntentCreatedRecord
    {
        public string PaymentIntentId { get; set; } = string.Empty;
        public string UserId { get; set; } = string.Empty;
        public string Currency { get; set; } = "USD";
        public decimal Subtotal { get; set; }
        public decimal DiscountTotal { get; set; }
        public decimal TaxTotal { get; set; }
        public decimal Total { get; set; }
        /// <summary>Позиции в доменном виде — маппинг в тип хранения делает сам сервис.</summary>
        public List<CheckoutLineItem> CheckoutItems { get; set; } = new();
    }

    public class OrderFinalizationRequest
    {
        public string PaymentIntentId { get; set; } = string.Empty;

        /// <summary>Гард владельца для клиентского confirm (userId вызывающего). null для вебхука.</summary>
        public string? ExpectedUserId { get; set; }

        public string? TraceId { get; set; }

        /// <summary>"confirm" | "webhook" — для логов и события заказа.</summary>
        public string Source { get; set; } = "confirm";

        /// <summary>
        /// Лимит попыток задумывался против retry-цикла браузера. Ретраи Stripe легитимны и
        /// ограничены самим Stripe, поэтому для вебхука лимит не применяется — иначе три
        /// транзиентные ошибки навсегда закрывали бы заказу путь к финализации.
        /// </summary>
        public bool EnforceAttemptLimit { get; set; } = true;
    }

    public enum FinalizationOutcome
    {
        Confirmed,
        AlreadyConfirmed,
        Processing,
        AttemptsExceeded,
        NotFound,
        OwnerMismatch,
        NotSucceeded,
        Failed
    }

    public class OrderFinalizationResult
    {
        public FinalizationOutcome Outcome { get; set; }
        public string? OrderId { get; set; }
        public string? StatusLabel { get; set; }
        public string? ErrorCode { get; set; }
        public string? ErrorMessage { get; set; }

        public static OrderFinalizationResult Ok(FinalizationOutcome outcome, string? orderId, string statusLabel)
            => new() { Outcome = outcome, OrderId = orderId, StatusLabel = statusLabel };

        public static OrderFinalizationResult Error(FinalizationOutcome outcome, string? code, string? message)
            => new() { Outcome = outcome, ErrorCode = code, ErrorMessage = message };
    }

    public static class FinalizationStatus
    {
        public const string Created = "Created";
        public const string Processing = "Processing";
        public const string Succeeded = "Succeeded";
        public const string Failed = "Failed";
    }

    public class OrderFinalizationService : IOrderFinalizationService
    {
        private const int MaxFinalizeAttempts = 3;
        private static readonly TimeSpan ProcessingCooldown = TimeSpan.FromSeconds(60);
        /// <summary>Окно, за которым счётчик неудачных попыток считается протухшим.</summary>
        private static readonly TimeSpan AttemptWindow = TimeSpan.FromMinutes(30);

        private readonly IOrderRepository _orderRepository;
        private readonly IKeyFulfillmentService _keyFulfillmentService;
        private readonly IStripePaymentIntentGateway _paymentIntents;
        private readonly ILogger<OrderFinalizationService> _logger;
        private readonly IMongoCollection<PaymentFinalizationStateDb> _finalizationStates;
        private readonly IMongoCollection<PaymentFinalizationFailureDb> _finalizationFailures;

        public OrderFinalizationService(
            IOrderRepository orderRepository,
            IKeyFulfillmentService keyFulfillmentService,
            IStripePaymentIntentGateway paymentIntents,
            ILogger<OrderFinalizationService> logger,
            IMongoDatabase database)
        {
            _orderRepository = orderRepository;
            _keyFulfillmentService = keyFulfillmentService;
            _paymentIntents = paymentIntents;
            _logger = logger;
            _finalizationStates = database.GetCollection<PaymentFinalizationStateDb>("PaymentFinalizationStates");
            _finalizationFailures = database.GetCollection<PaymentFinalizationFailureDb>("PaymentFinalizationFailures");
        }

        public async Task RecordIntentCreatedAsync(IntentCreatedRecord record)
        {
            var now = DateTime.UtcNow;
            var stateUpdate = Builders<PaymentFinalizationStateDb>.Update
                .Set(item => item.PaymentIntentId, record.PaymentIntentId)
                .Set(item => item.UserId, record.UserId)
                .Set(item => item.Status, FinalizationStatus.Created)
                .Set(item => item.Attempts, 0)
                .Set(item => item.Currency, record.Currency)
                .Set(item => item.Subtotal, record.Subtotal)
                .Set(item => item.DiscountTotal, record.DiscountTotal)
                .Set(item => item.TaxTotal, record.TaxTotal)
                .Set(item => item.Total, record.Total)
                .Set(item => item.CheckoutItems, record.CheckoutItems.Select(ToStateDb).ToList())
                .Set(item => item.UpdatedAt, now)
                .SetOnInsert(item => item.CreatedAt, now);

            await _finalizationStates.UpdateOneAsync(item => item.PaymentIntentId == record.PaymentIntentId, stateUpdate, new UpdateOptions { IsUpsert = true });
        }

        public async Task<string?> FindReusableIntentIdAsync(string userId)
        {
            if (string.IsNullOrWhiteSpace(userId))
            {
                return null;
            }

            // Только Created: Processing/Succeeded/Failed трогать нельзя — там уже идёт или прошла оплата.
            // Индекс ix_payment_state_user_updated (UserId + UpdatedAt desc).
            var state = await _finalizationStates
                .Find(item => item.UserId == userId && item.Status == FinalizationStatus.Created)
                .SortByDescending(item => item.UpdatedAt)
                .FirstOrDefaultAsync();

            return state?.PaymentIntentId;
        }

        public async Task<OrderFinalizationResult> FinalizeAsync(OrderFinalizationRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.PaymentIntentId))
            {
                return OrderFinalizationResult.Error(FinalizationOutcome.NotFound, "PAYMENT_INTENT_REQUIRED", "paymentIntentId is required.");
            }

            var now = DateTime.UtcNow;
            var state = await _finalizationStates.Find(item => item.PaymentIntentId == request.PaymentIntentId).FirstOrDefaultAsync();

            if (state?.Status == FinalizationStatus.Succeeded && !string.IsNullOrWhiteSpace(state.OrderId))
            {
                return OrderFinalizationResult.Ok(FinalizationOutcome.AlreadyConfirmed, state.OrderId, "already_confirmed");
            }

            // Счётчик протухает: после окна неудачные попытки не должны держать заказ вечно.
            var attemptsSoFar = state is null || now - state.UpdatedAt > AttemptWindow ? 0 : state.Attempts;

            if (request.EnforceAttemptLimit
                && state?.Status == FinalizationStatus.Failed
                && attemptsSoFar >= MaxFinalizeAttempts)
            {
                return OrderFinalizationResult.Error(FinalizationOutcome.AttemptsExceeded, "FINALIZATION_ATTEMPTS_EXCEEDED",
                    "We couldn't finalize your order yet. Please contact support with the reference below.");
            }

            // Захват лока — ОДНОЙ атомарной операцией. Раньше состояние сначала читалось,
            // а потом записывалось: между этими шагами клиентский confirm и вебхук
            // проскакивали оба и оба шли создавать заказ.
            var attempts = attemptsSoFar + 1;
            if (!await TryClaimAsync(request.PaymentIntentId, attempts, now))
            {
                return OrderFinalizationResult.Error(FinalizationOutcome.Processing, "FINALIZATION_ALREADY_PROCESSING",
                    "Your payment is already being processed. Please wait a moment and refresh.");
            }

            var resolvedUserId = request.ExpectedUserId ?? string.Empty;
            try
            {
                var paymentIntent = await _paymentIntents.GetAsync(request.PaymentIntentId);
                if (paymentIntent == null)
                {
                    await MarkFailedAsync(request.PaymentIntentId, resolvedUserId, attempts, "PAYMENT_INTENT_NOT_FOUND", "Payment intent not found.", null, request.TraceId);
                    return OrderFinalizationResult.Error(FinalizationOutcome.NotFound, "PAYMENT_INTENT_NOT_FOUND", "Payment intent not found.");
                }

                var metadataUserId = paymentIntent.Metadata.TryGetValue("userId", out var storedUserId) ? storedUserId : string.Empty;

                // Гард владельца — только для клиентского confirm (когда передан ExpectedUserId).
                if (!string.IsNullOrWhiteSpace(request.ExpectedUserId)
                    && !string.IsNullOrWhiteSpace(metadataUserId)
                    && !string.Equals(metadataUserId, request.ExpectedUserId, StringComparison.OrdinalIgnoreCase))
                {
                    await MarkFailedAsync(request.PaymentIntentId, request.ExpectedUserId, attempts, "PAYMENT_OWNER_MISMATCH", "Payment intent belongs to another user.", null, request.TraceId);
                    return OrderFinalizationResult.Error(FinalizationOutcome.OwnerMismatch, "PAYMENT_OWNER_MISMATCH", "Payment intent belongs to another user.");
                }

                // Владелец заказа = плательщик из метаданных PI (для вебхука ExpectedUserId нет).
                resolvedUserId = !string.IsNullOrWhiteSpace(metadataUserId) ? metadataUserId : (request.ExpectedUserId ?? string.Empty);

                if (!string.Equals(paymentIntent.Status, "succeeded", StringComparison.OrdinalIgnoreCase))
                {
                    await MarkFailedAsync(request.PaymentIntentId, resolvedUserId, attempts, "PAYMENT_NOT_SUCCEEDED", $"Payment status: {paymentIntent.Status}", null, request.TraceId);
                    return OrderFinalizationResult.Error(FinalizationOutcome.NotSucceeded, "PAYMENT_NOT_SUCCEEDED", $"Payment is not successful yet. Status: {paymentIntent.Status}.");
                }

                // Точечный поиск по индексу ix_orders_payment_intent_unique.
                // Раньше тянулась ВСЯ история заказов пользователя и фильтровалась в памяти.
                var existing = await _orderRepository.GetByPaymentIntentIdAsync(request.PaymentIntentId);
                if (existing != null)
                {
                    await MarkSucceededAsync(request.PaymentIntentId, resolvedUserId, attempts, existing.Id.ToString());
                    await MarkFailureResolvedAsync(request.PaymentIntentId, existing.Id.ToString());
                    return OrderFinalizationResult.Ok(FinalizationOutcome.AlreadyConfirmed, existing.Id.ToString(), "already_confirmed");
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
                    UserId = resolvedUserId,
                    PaymentProvider = "stripe",
                    PaymentIntentId = request.PaymentIntentId,
                    GameId = firstItem?.GameId ?? string.Empty,
                    GameName = firstItem?.Title ?? "Checkout purchase",
                    UserName = resolvedUserId,
                    IsPaid = true,
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
                        new() { Type = "paid", Message = $"Stripe payment confirmed ({request.Source})", CreatedAt = nowCreated }
                    },
                    Items = orderItems
                };

                try
                {
                    await _orderRepository.CreateOrderAsync(order);
                }
                catch (Exception createEx) when (IsDuplicateKey(createEx))
                {
                    // Гонка: другой финализатор (клиентский confirm ИЛИ Stripe-вебхук) уже создал заказ
                    // для этого PaymentIntent — уникальный индекс по PaymentIntentId бросил дубль.
                    // Это не ошибка: находим заказ-победитель и отдаём already_confirmed (без повторной выдачи ключей).
                    var winner = await _orderRepository.GetByPaymentIntentIdAsync(request.PaymentIntentId);
                    if (winner != null)
                    {
                        await MarkSucceededAsync(request.PaymentIntentId, resolvedUserId, attempts, winner.Id.ToString());
                        await MarkFailureResolvedAsync(request.PaymentIntentId, winner.Id.ToString());
                        return OrderFinalizationResult.Ok(FinalizationOutcome.AlreadyConfirmed, winner.Id.ToString(), "already_confirmed");
                    }
                    throw; // дубль, но заказ не нашли — пробрасываем как реальную ошибку
                }

                // Выдаём ключи и проставляем реальный статус выдачи (заказ сохраняется внутри).
                // ВАЖНО: заказ уже создан и ОПЛАЧЕН — он финализирован. Сбой самой выдачи ключей
                // (пул, outbox, сеть) НЕ должен превращать успешную оплату в «order finalization issue».
                // Заказ остаётся PENDING_KEYS/IsFulfilled=false и будет добит BackfillGameAsync при
                // пополнении пула; клиент видит честное «awaiting keys», а не ошибку оплаты.
                var fulfillmentFailed = false;
                try
                {
                    await _keyFulfillmentService.FulfillOrderAsync(order);
                }
                catch (Exception fulfillEx)
                {
                    fulfillmentFailed = true;
                    _logger.LogError(fulfillEx, "Order {OrderId} paid & created, but key fulfillment failed for {PaymentIntentId}. Left pending for backfill.",
                        order.Id, request.PaymentIntentId);

                    // Клиенту — успех (заказ оплачен и создан), но админка обязана это УВИДЕТЬ.
                    // Иначе сбой выдачи остаётся только в логах и о нём никто не узнает.
                    await RecordFulfillmentFailureAsync(request.PaymentIntentId, resolvedUserId, order.Id.ToString(), fulfillEx, request.TraceId);
                }

                await MarkSucceededAsync(request.PaymentIntentId, resolvedUserId, attempts, order.Id.ToString());

                // Закрывать запись о проблеме можно только если выдача реально прошла.
                if (!fulfillmentFailed)
                {
                    await MarkFailureResolvedAsync(request.PaymentIntentId, order.Id.ToString());
                }

                return OrderFinalizationResult.Ok(FinalizationOutcome.Confirmed, order.Id.ToString(), "confirmed");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to finalize order for payment intent {PaymentIntentId} (source {Source})", request.PaymentIntentId, request.Source);
                await MarkFailedAsync(request.PaymentIntentId, resolvedUserId, attempts, "ORDER_CREATE_FAILED", "We couldn't finalize your order. Please try again or contact support.", ex, request.TraceId);
                return OrderFinalizationResult.Error(FinalizationOutcome.Failed, "ORDER_CREATE_FAILED", "We couldn't finalize your order. Please try again or contact support.");
            }
        }

        /// <summary>
        /// Пытается стать ЕДИНСТВЕННЫМ финализатором этого платежа.
        /// Условие захвата: статус не Processing ЛИБО прошлый захват протух (дольше ProcessingCooldown).
        /// Проверка и запись выполняются одной операцией, поэтому «проскочить вдвоём» невозможно.
        /// </summary>
        private async Task<bool> TryClaimAsync(string paymentIntentId, int attempts, DateTime now)
        {
            var staleBefore = now - ProcessingCooldown;
            var filter = Builders<PaymentFinalizationStateDb>.Filter.And(
                Builders<PaymentFinalizationStateDb>.Filter.Eq(item => item.PaymentIntentId, paymentIntentId),
                Builders<PaymentFinalizationStateDb>.Filter.Or(
                    Builders<PaymentFinalizationStateDb>.Filter.Ne(item => item.Status, FinalizationStatus.Processing),
                    Builders<PaymentFinalizationStateDb>.Filter.Lt(item => item.UpdatedAt, staleBefore)));

            var update = Builders<PaymentFinalizationStateDb>.Update
                .Set(item => item.Status, FinalizationStatus.Processing)
                .Set(item => item.Attempts, attempts)
                .Set(item => item.LastErrorCode, (string?)null)
                .Set(item => item.LastErrorMessage, (string?)null)
                .Set(item => item.UpdatedAt, now);

            var claimed = await _finalizationStates.FindOneAndUpdateAsync(filter, update,
                new FindOneAndUpdateOptions<PaymentFinalizationStateDb> { ReturnDocument = ReturnDocument.After });

            if (claimed != null)
            {
                return true;
            }

            // Документа могло не быть вовсе (платёж создан вне обычного флоу) — заводим его.
            // Уникальный индекс ix_payment_state_intent разрешит гонку: проигравший получит дубль.
            try
            {
                await _finalizationStates.InsertOneAsync(new PaymentFinalizationStateDb
                {
                    PaymentIntentId = paymentIntentId,
                    Status = FinalizationStatus.Processing,
                    Attempts = attempts,
                    UpdatedAt = now,
                    CreatedAt = now
                });
                return true;
            }
            catch (Exception ex) when (IsDuplicateKey(ex))
            {
                // Документ есть и лок держит кто-то другой.
                return false;
            }
        }

        private static List<OrderItemSnapshot> BuildOrderItemsFromState(PaymentFinalizationStateDb? state, PaymentIntentSnapshot paymentIntent)
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
                .Set(item => item.LastErrorCode, (string?)null)
                .Set(item => item.LastErrorMessage, (string?)null)
                .Set(item => item.UpdatedAt, DateTime.UtcNow)
                .SetOnInsert(item => item.CreatedAt, DateTime.UtcNow);

            await _finalizationStates.UpdateOneAsync(item => item.PaymentIntentId == paymentIntentId, update, new UpdateOptions { IsUpsert = true });
        }

        private async Task MarkFailedAsync(string paymentIntentId, string userId, int attempts, string code, string message, Exception? ex, string? traceId)
        {
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
                .Set(item => item.TraceId, traceId ?? string.Empty)
                .Set(item => item.Attempts, attempts)
                .Set(item => item.Status, "Open")
                .SetOnInsert(item => item.PaymentIntentId, paymentIntentId)
                .SetOnInsert(item => item.CreatedAt, now);

            await _finalizationFailures.UpdateOneAsync(item => item.PaymentIntentId == paymentIntentId, failureUpdate, new UpdateOptions { IsUpsert = true });
        }

        /// <summary>
        /// Заказ оплачен и создан, но ключи выдать не удалось. Финализация при этом УСПЕШНА
        /// (клиенту не показываем ошибку оплаты), поэтому статус состояния не трогаем —
        /// пишем только запись о проблеме, которую видит админка (Payment issues).
        /// </summary>
        private async Task RecordFulfillmentFailureAsync(string paymentIntentId, string userId, string orderId, Exception ex, string? traceId)
        {
            var now = DateTime.UtcNow;
            var update = Builders<PaymentFinalizationFailureDb>.Update
                .Set(item => item.UserId, userId)
                .Set(item => item.OrderId, orderId)
                .Set(item => item.LastSeenAt, now)
                .Set(item => item.ErrorCode, "FULFILLMENT_FAILED")
                .Set(item => item.ErrorMessage, "Order is paid, but key delivery failed. Keys are pending backfill.")
                .Set(item => item.TechnicalDetails, $"{ex.GetType().Name}: {ex.Message}{Environment.NewLine}{ex.StackTrace}")
                .Set(item => item.TraceId, traceId ?? string.Empty)
                .Set(item => item.Status, "Open")
                .SetOnInsert(item => item.PaymentIntentId, paymentIntentId)
                .SetOnInsert(item => item.CreatedAt, now);

            await _finalizationFailures.UpdateOneAsync(item => item.PaymentIntentId == paymentIntentId, update, new UpdateOptions { IsUpsert = true });
        }

        private async Task MarkFailureResolvedAsync(string paymentIntentId, string orderId)
        {
            var update = Builders<PaymentFinalizationFailureDb>.Update
                .Set(item => item.Status, "Resolved")
                .Set(item => item.LastSeenAt, DateTime.UtcNow)
                .Set(item => item.OrderId, orderId);

            await _finalizationFailures.UpdateOneAsync(item => item.PaymentIntentId == paymentIntentId, update);
        }

        /// <summary>Доменная позиция → тип хранения. Держим маппинг здесь, а не у вызывающих.</summary>
        private static CheckoutLineItemStateDb ToStateDb(CheckoutLineItem item) => new()
        {
            ProductType = item.ProductType,
            GameId = item.GameId,
            Title = item.Title,
            CoverUrl = item.CoverUrl,
            Platform = item.Platform,
            Region = item.Region,
            Quantity = item.Quantity,
            UnitPrice = item.UnitPrice,
            DiscountPerUnit = item.DiscountPerUnit,
            FinalUnitPrice = item.FinalUnitPrice,
            LineTotal = item.LineTotal,
            Currency = item.Currency
        };

        private static bool IsDuplicateKey(Exception ex) => ex switch
        {
            MongoWriteException write => write.WriteError?.Category == ServerErrorCategory.DuplicateKey,
            MongoBulkWriteException bulk => bulk.WriteErrors.Any(error => error.Category == ServerErrorCategory.DuplicateKey),
            _ => false
        };

        private static string GenerateOrderNumber()
        {
            var now = DateTime.UtcNow;
            return $"TS-{now:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";
        }

        private static string BuildPaymentNote(string paymentIntentId) => $"stripe_payment_intent:{paymentIntentId}";
    }
}
