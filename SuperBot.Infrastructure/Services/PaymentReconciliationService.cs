using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using SuperBot.Core.Entities;
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
    }

    public class PaymentReconciliationService : IPaymentReconciliationService
    {
        public const string PaymentStatusRefunded = "REFUNDED";
        public const string PaymentStatusPartiallyRefunded = "PARTIALLY_REFUNDED";
        public const string PaymentStatusDisputed = "DISPUTED";
        /// <summary>Статус заказа для UI — 'REFUNDED' уже поддержан аккаунтом и админкой.</summary>
        public const string OrderStatusRefunded = "REFUNDED";

        private readonly IOrderRepository _orderRepository;
        private readonly SuperBot.Core.Interfaces.ICashbackService _cashback;
        private readonly IMongoCollection<PaymentFinalizationFailureDb> _paymentIssues;
        private readonly ILogger<PaymentReconciliationService> _logger;

        public PaymentReconciliationService(
            IOrderRepository orderRepository,
            SuperBot.Core.Interfaces.ICashbackService cashback,
            IMongoDatabase database,
            ILogger<PaymentReconciliationService> logger)
        {
            _orderRepository = orderRepository;
            _cashback = cashback;
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

            // Идемпотентность: то же состояние уже проставлено — второй раз событие не пишем.
            if (string.Equals(order.PaymentStatus, targetPaymentStatus, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            var refunded = ToMajorUnits(notice.AmountRefundedMinor);
            order.PaymentStatus = targetPaymentStatus;
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

            // Полный возврат — откатываем начисленный кэшбэк (защита от фарма «купил → вернул»).
            // No-op, если по заказу ничего не начислялось (гость/выключенная программа). Best-effort:
            // сбой лояльности не должен ронять сверку платежа.
            if (isFullRefund)
            {
                try
                {
                    await _cashback.ReverseForOrderAsync(order.Id.ToString());
                }
                catch (Exception cashbackEx)
                {
                    _logger.LogError(cashbackEx, "Cashback reversal failed for refunded order {OrderId}.", order.Id);
                }
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

        public async Task<bool> ApplyDisputeAsync(DisputeNotice notice)
        {
            var order = await _orderRepository.GetByPaymentIntentIdAsync(notice.PaymentIntentId);
            if (order == null)
            {
                _logger.LogWarning("Dispute {DisputeId} for {PaymentIntentId}: order not found yet.", notice.DisputeId, notice.PaymentIntentId);
                return false;
            }

            if (string.Equals(order.PaymentStatus, PaymentStatusDisputed, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            var amount = ToMajorUnits(notice.AmountMinor);

            // Статус заказа НЕ меняем: спор ещё не проигран, товар формально доставлен.
            // Меняем платёжный статус и обязательно поднимаем флаг админу.
            order.PaymentStatus = PaymentStatusDisputed;
            order.UpdatedAt = DateTime.UtcNow;
            order.Events ??= new List<OrderEvent>();
            order.Events.Add(new OrderEvent
            {
                Type = "dispute",
                Message = $"Chargeback opened ({amount:0.00} {notice.Currency.ToUpperInvariant()}), reason: {notice.Reason ?? "unspecified"}",
                CreatedAt = DateTime.UtcNow
            });

            await _orderRepository.UpdateOrderAsync(order);

            await RaisePaymentIssueAsync(notice.PaymentIntentId, order,
                "PAYMENT_DISPUTED",
                $"Chargeback opened ({amount:0.00} {notice.Currency.ToUpperInvariant()}), reason: {notice.Reason ?? "unspecified"}. Dispute {notice.DisputeId}.",
                notice.EventId);

            _logger.LogWarning("Order {OrderId} disputed ({DisputeId}), amount {Amount} {Currency}.",
                order.Id, notice.DisputeId, amount, notice.Currency);

            return true;
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

        private static decimal ToMajorUnits(long minorUnits) => minorUnits / 100m;
    }
}
