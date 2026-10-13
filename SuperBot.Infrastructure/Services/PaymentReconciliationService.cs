using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Payments;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Services
{
    /// <summary>
    /// Приводит заказ в соответствие с тем, что произошло с платежом ПОСЛЕ оплаты:
    /// возвраты и оспаривания (чарджбеки). Без этого заказ навсегда оставался DELIVERED,
    /// даже если деньги вернули — классическая схема «купил, получил ключ, сделал чарджбек».
    ///
    /// ВАЖНО: ключи здесь НЕ отзываются. Выданный ключ технически уже у покупателя
    /// (его могли активировать), поэтому мы фиксируем факт и поднимаем флаг для админа,
    /// а решение по товару/блокировке остаётся за человеком.
    /// </summary>
    public interface IPaymentReconciliationService
    {
        Task<bool> ApplyRefundAsync(RefundNotice notice);
        Task<bool> ApplyDisputeAsync(DisputeNotice notice);
    }

    public class RefundNotice
    {
        public string PaymentIntentId { get; set; } = string.Empty;
        /// <summary>Сколько всего возвращено по платежу, в минорных единицах.</summary>
        public long AmountRefundedMinor { get; set; }
        /// <summary>Полная сумма платежа, в минорных единицах.</summary>
        public long ChargeAmountMinor { get; set; }
        public string Currency { get; set; } = "USD";
        public string? EventId { get; set; }
    }

    public class DisputeNotice
    {
        public string PaymentIntentId { get; set; } = string.Empty;
        public string DisputeId { get; set; } = string.Empty;
        public string? Reason { get; set; }
        public long AmountMinor { get; set; }
        public string Currency { get; set; } = "USD";
        public string? EventId { get; set; }
        /// <summary>Статус спора в Stripe; пусто — старый вызов, считаем спор открытым (needs_response).</summary>
        public string? Status { get; set; }
        /// <summary>До какого момента банк ждёт доказательств.</summary>
        public DateTime? EvidenceDueBy { get; set; }
        public bool HasEvidence { get; set; }
    }

    public static class DisputeStatuses
    {
        public const string Won = "won";
        public const string Lost = "lost";
        /// <summary>Запрос банка (inquiry) закрыт без списания денег — для магазина то же, что выигрыш.</summary>
        public const string WarningClosed = "warning_closed";

        public static bool IsClosed(string? status) => status is Won or Lost or WarningClosed;
    }

    public class PaymentReconciliationService : IPaymentReconciliationService
    {
        public const string PaymentStatusRefunded = "REFUNDED";
        public const string PaymentStatusPartiallyRefunded = "PARTIALLY_REFUNDED";
        public const string PaymentStatusDisputed = "DISPUTED";
        /// <summary>Спор проигран: деньги остались у покупателя. Для отчётов и кэшбэка — возврат на сумму спора.</summary>
        public const string PaymentStatusDisputeLost = "DISPUTE_LOST";
        /// <summary>Статус заказа для UI — 'REFUNDED' уже поддержан аккаунтом и админкой.</summary>
        public const string OrderStatusRefunded = "REFUNDED";

        private readonly IOrderRepository _orderRepository;
        private readonly IPurchaseAnalytics _analytics;
        private readonly IMongoCollection<PaymentFinalizationFailureDb> _paymentIssues;
        private readonly ILogger<PaymentReconciliationService> _logger;
        private readonly ICashbackOrderEvents _cashback;
        private readonly IOrderTaxService _tax;
        private readonly IGameReviewRepository _reviews;

        public PaymentReconciliationService(
            IOrderRepository orderRepository,
            IMongoDatabase database,
            IPurchaseAnalytics analytics,
            ILogger<PaymentReconciliationService> logger,
            ICashbackOrderEvents cashback,
            IOrderTaxService tax,
            IGameReviewRepository reviews)
        {
            _tax = tax;
            _cashback = cashback;
            _reviews = reviews;
            _orderRepository = orderRepository;
            _analytics = analytics;
            _paymentIssues = database.GetCollection<PaymentFinalizationFailureDb>("PaymentFinalizationFailures");
            _logger = logger;
        }

        public async Task<bool> ApplyRefundAsync(RefundNotice notice)
        {
            var order = await _orderRepository.GetByPaymentIntentIdAsync(notice.PaymentIntentId);
            if (order == null)
            {
                // Заказ мог ещё не финализироваться — пусть Stripe придёт ещё раз.
                _logger.LogWarning("Refund for {PaymentIntentId}: order not found yet.", notice.PaymentIntentId);
                return false;
            }

            var isFullRefund = notice.ChargeAmountMinor > 0 && notice.AmountRefundedMinor >= notice.ChargeAmountMinor;
            var targetPaymentStatus = isFullRefund ? PaymentStatusRefunded : PaymentStatusPartiallyRefunded;

            var refunded = CurrencyMinorUnits.FromMinor(notice.AmountRefundedMinor, notice.Currency);

            // Идемпотентность: то же состояние с той же суммой уже проставлено — второй раз событие не пишем.
            // Сумма тоже сравнивается: второй частичный возврат приходит с тем же статусом, но большей суммой.
            if (string.Equals(order.PaymentStatus, targetPaymentStatus, StringComparison.OrdinalIgnoreCase)
                && (isFullRefund || order.RefundedAmount == refunded))
            {
                return true;
            }

            order.PaymentStatus = targetPaymentStatus;
            // Сумма от Stripe накопительная по всему платежу, поэтому присваиваем, а не
            // прибавляем: второй частичный возврат придёт уже с общим итогом.
            order.RefundedAmount = refunded;
            if (isFullRefund)
            {
                order.Status = OrderStatusRefunded;
            }

            order.UpdatedAt = DateTime.UtcNow;
            order.Events ??= new List<OrderEvent>();
            order.Events.Add(new OrderEvent
            {
                Type = "refund",
                Message = isFullRefund
                    ? $"Full refund of {refunded:0.00} {notice.Currency.ToUpperInvariant()}"
                    : $"Partial refund of {refunded:0.00} {notice.Currency.ToUpperInvariant()}",
                CreatedAt = DateTime.UtcNow
            });

            await _orderRepository.UpdateOrderAsync(order);

            // Отправляем отсюда, а не из вызывающего кода: это единственная точка, где состояние
            // возврата действительно меняется. Повторный вебхук выходит раньше по проверке
            // идемпотентности, поэтому второго события не будет.
            await _analytics.TrackRefundAsync(order, refunded, isFullRefund);
            // Кэшбэк за заказ забираем в той же доле, потраченный на заказ — возвращаем на баланс.
            await _cashback.OnOrderRefundedAsync(order);
            // Налоговую транзакцию сторнируем в той же доле — иначе возвращённые деньги остались бы в декларации.
            await _tax.OnOrderRefundedAsync(order);
            // Отзывы на возвращённые игры — с пометкой «Refunded»; сбой пометки возврат не отменяет.
            try
            {
                var refundedGames = SuperBot.Core.Services.RefundedPurchases.GameIds(order);
                if (refundedGames.Count > 0 && !string.IsNullOrWhiteSpace(order.UserName))
                {
                    await _reviews.MarkRefundedAsync(order.UserName, refundedGames.ToList());
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not mark reviews refunded for order {OrderId}", order.Id);
            }

            _logger.LogInformation("Order {OrderId} marked {Status} after refund of {Amount} {Currency}.",
                order.Id, targetPaymentStatus, refunded, notice.Currency);

            // Возврат по товару, который уже выдан ключом, требует внимания человека.
            if (order.IsFulfilled)
            {
                await RaisePaymentIssueAsync(notice.PaymentIntentId, order,
                    "REFUNDED_AFTER_DELIVERY",
                    $"Order was refunded ({refunded:0.00} {notice.Currency.ToUpperInvariant()}) after keys had been delivered.",
                    notice.EventId);
            }

            return true;
        }

        /// <summary>
        /// Спор по оплате — все его события: открытие, смена статуса (например, пришёл срок ответа) и закрытие.
        /// Stripe шлёт их «хотя бы один раз» и не обязательно по порядку, поэтому каждое применяется идемпотентно, а
        /// закрытый спор больше не открывается запоздавшим событием.
        /// </summary>
        public async Task<bool> ApplyDisputeAsync(DisputeNotice notice)
        {
            var order = await _orderRepository.GetByPaymentIntentIdAsync(notice.PaymentIntentId);
            if (order == null)
            {
                _logger.LogWarning("Dispute {DisputeId} for {PaymentIntentId}: order not found yet.", notice.DisputeId, notice.PaymentIntentId);
                return false;
            }

            var status = string.IsNullOrWhiteSpace(notice.Status) ? "needs_response" : notice.Status.Trim().ToLowerInvariant();
            var dispute = order.Dispute;
            var sameDispute = dispute != null && string.Equals(dispute.Id, notice.DisputeId, StringComparison.Ordinal);

            // Закрытый спор уже применён: повтор и запоздавшие «needs_response» ничего не меняют.
            if (sameDispute && dispute!.Outcome != null)
            {
                return true;
            }

            if (!sameDispute)
            {
                dispute = new OrderDispute
                {
                    Id = notice.DisputeId,
                    OpenedAt = DateTime.UtcNow,
                    // Если спор уже открыт другим событием — берём статус до него, а не DISPUTED.
                    PaymentStatusBefore = string.Equals(order.PaymentStatus, PaymentStatusDisputed, StringComparison.OrdinalIgnoreCase)
                        ? order.Dispute?.PaymentStatusBefore ?? "PAID"
                        : order.PaymentStatus ?? "PAID"
                };
                order.Dispute = dispute;
            }

            dispute!.Status = status;
            dispute.Reason = notice.Reason ?? dispute.Reason;
            dispute.AmountMinor = notice.AmountMinor > 0 ? notice.AmountMinor : dispute.AmountMinor;
            dispute.Currency = (notice.Currency ?? dispute.Currency).ToUpperInvariant();
            dispute.EvidenceDueBy = notice.EvidenceDueBy ?? dispute.EvidenceDueBy;
            dispute.HasEvidence = notice.HasEvidence || dispute.HasEvidence;

            var amount = CurrencyMinorUnits.FromMinor(dispute.AmountMinor, dispute.Currency);
            var money = $"{amount:0.00} {dispute.Currency}";

            if (DisputeStatuses.IsClosed(status))
            {
                return status == DisputeStatuses.Lost
                    ? await CloseLostAsync(order, dispute, amount, money, notice.EventId)
                    : await CloseWonAsync(order, dispute, status, money, notice.EventId);
            }

            var firstTime = !string.Equals(order.PaymentStatus, PaymentStatusDisputed, StringComparison.OrdinalIgnoreCase);
            order.PaymentStatus = PaymentStatusDisputed;
            order.UpdatedAt = DateTime.UtcNow;
            order.Events ??= new List<OrderEvent>();
            if (firstTime)
            {
                // Статус заказа НЕ меняем: спор ещё не проигран, товар формально доставлен.
                order.Events.Add(new OrderEvent
                {
                    Type = "dispute",
                    Message = $"Chargeback opened ({money}), reason: {notice.Reason ?? "unspecified"}",
                    CreatedAt = DateTime.UtcNow
                });
            }

            await _orderRepository.UpdateOrderAsync(order);
            if (firstTime)
            {
                await _cashback.OnOrderDisputedAsync(order);
            }

            // Проблема в Payment issues обновляется на каждом событии: главное в ней — до какого числа ответить банку.
            await RaisePaymentIssueAsync(notice.PaymentIntentId, order, "PAYMENT_DISPUTED", OpenDisputeMessage(dispute, money), notice.EventId);

            if (firstTime)
            {
                _logger.LogWarning("Order {OrderId} disputed ({DisputeId}), amount {Money}.", order.Id, notice.DisputeId, money);
            }
            return true;
        }

        /// <summary>Выигран (или запрос банка закрыт без списания): деньги у магазина, заказ снова оплачен, кэшбэк возвращается.</summary>
        private async Task<bool> CloseWonAsync(Order order, OrderDispute dispute, string status, string money, string? eventId)
        {
            dispute.Outcome = status;
            dispute.ClosedAt = DateTime.UtcNow;
            if (string.Equals(order.PaymentStatus, PaymentStatusDisputed, StringComparison.OrdinalIgnoreCase))
            {
                order.PaymentStatus = dispute.PaymentStatusBefore ?? "PAID";
            }
            order.UpdatedAt = DateTime.UtcNow;
            order.Events ??= new List<OrderEvent>();
            order.Events.Add(new OrderEvent
            {
                Type = "dispute_won",
                Message = status == DisputeStatuses.Won
                    ? $"Chargeback won — {money} returned to the shop"
                    : "Bank inquiry closed without a chargeback",
                CreatedAt = DateTime.UtcNow
            });

            await _orderRepository.UpdateOrderAsync(order);
            await _cashback.OnDisputeWonAsync(order);
            await ResolvePaymentIssueAsync(order.PaymentIntentId!, status == DisputeStatuses.Won
                ? $"Chargeback won ({money}). The order counts as paid again; the customer's cashback was given back."
                : "Bank inquiry closed without a chargeback. Nothing was withdrawn.", eventId);

            _logger.LogInformation("Dispute {DisputeId} on order {OrderId} closed: {Status}.", dispute.Id, order.Id, status);
            return true;
        }

        /// <summary>
        /// Проигран: деньги остались у покупателя. Для денег это возврат на сумму спора — отчёты, налог и кэшбэк
        /// считают его так же, как обычный возврат. Ключи не отзываются: это решение человека, поэтому проблема остаётся открытой.
        /// </summary>
        private async Task<bool> CloseLostAsync(Order order, OrderDispute dispute, decimal amount, string money, string? eventId)
        {
            dispute.Outcome = DisputeStatuses.Lost;
            dispute.ClosedAt = DateTime.UtcNow;

            var paid = order.Totals?.Total is > 0 ? order.Totals.Total : order.TotalAmount ?? 0m;
            // Спор идёт на ещё не возвращённую часть платежа, поэтому к уже возвращённому прибавляем, не больше оплаченного.
            var refunded = paid > 0 ? Math.Min(paid, (order.RefundedAmount ?? 0m) + amount) : (order.RefundedAmount ?? 0m) + amount;
            var isFull = paid > 0 && refunded >= paid;
            order.RefundedAmount = refunded;
            order.PaymentStatus = PaymentStatusDisputeLost;
            if (isFull)
            {
                order.Status = OrderStatusRefunded;
            }
            order.UpdatedAt = DateTime.UtcNow;
            order.Events ??= new List<OrderEvent>();
            order.Events.Add(new OrderEvent
            {
                Type = "dispute_lost",
                Message = $"Chargeback lost — {money} stays with the customer",
                CreatedAt = DateTime.UtcNow
            });

            await _orderRepository.UpdateOrderAsync(order);
            await _analytics.TrackRefundAsync(order, amount, isFull);
            // Деньги покупателю вернул банк — значит, и оплата кэшбэком отменяется: потраченное возвращается, начисленное забрано.
            await _cashback.OnOrderRefundedAsync(order);
            await _tax.OnOrderRefundedAsync(order);

            await RaisePaymentIssueAsync(order.PaymentIntentId!, order, "DISPUTE_LOST",
                order.IsFulfilled
                    ? $"Chargeback lost ({money}) after keys had been delivered. Review the customer before selling to them again."
                    : $"Chargeback lost ({money}). Keys were not delivered in full — check whether the rest should still go out.",
                eventId);

            _logger.LogWarning("Dispute {DisputeId} on order {OrderId} lost, {Money}.", dispute.Id, order.Id, money);
            return true;
        }

        private static string OpenDisputeMessage(OrderDispute dispute, string money)
        {
            var inquiry = dispute.Status.StartsWith("warning_", StringComparison.Ordinal);
            var what = inquiry ? $"Bank inquiry ({money})" : $"Chargeback opened ({money})";
            var reason = $"reason: {dispute.Reason ?? "unspecified"}";
            var due = dispute.EvidenceDueBy is { } by && !dispute.HasEvidence && dispute.Status.EndsWith("needs_response", StringComparison.Ordinal)
                ? $" Submit evidence in Stripe by {by:yyyy-MM-dd HH:mm} UTC."
                : dispute.HasEvidence ? " Evidence submitted — waiting for the bank." : string.Empty;
            return $"{what}, {reason}. Dispute {dispute.Id}.{due}";
        }

        private async Task ResolvePaymentIssueAsync(string paymentIntentId, string message, string? eventId)
        {
            var update = Builders<PaymentFinalizationFailureDb>.Update
                .Set(item => item.Status, "Resolved")
                .Set(item => item.ErrorMessage, message)
                .Set(item => item.TraceId, eventId ?? string.Empty)
                .Set(item => item.LastSeenAt, DateTime.UtcNow);
            await _paymentIssues.UpdateOneAsync(item => item.PaymentIntentId == paymentIntentId, update);
        }
        /// <summary>Показывается в админке на странице Payment issues.</summary>
        private async Task RaisePaymentIssueAsync(string paymentIntentId, Order order, string code, string message, string? eventId)
        {
            var now = DateTime.UtcNow;
            var update = Builders<PaymentFinalizationFailureDb>.Update
                .Set(item => item.UserId, order.UserId)
                .Set(item => item.OrderId, order.Id.ToString())
                .Set(item => item.LastSeenAt, now)
                .Set(item => item.ErrorCode, code)
                .Set(item => item.ErrorMessage, message)
                .Set(item => item.TraceId, eventId ?? string.Empty)
                .Set(item => item.Status, "Open")
                .SetOnInsert(item => item.PaymentIntentId, paymentIntentId)
                .SetOnInsert(item => item.CreatedAt, now);

            await _paymentIssues.UpdateOneAsync(item => item.PaymentIntentId == paymentIntentId, update, new UpdateOptions { IsUpsert = true });
        }

    }
}
