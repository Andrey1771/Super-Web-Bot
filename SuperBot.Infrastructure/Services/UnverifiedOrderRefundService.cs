using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Services
{
    /// <summary>
    /// Авто-возврат гостевых заказов, чья почта не подтверждена за 48 часов.
    /// Держать чужие деньги без выдачи товара нельзя; а благодаря гейту ключ так и не покинул
    /// пул — возврат безубыточен. Запускается Hangfire'ом раз в час.
    ///
    /// Гонка с подтверждением решена атомарными переходами на заказе:
    ///   sweeper:  PAID → REFUND_PENDING (только пока RequiresDeliveryVerification=true)
    ///   verify:   RequiresDeliveryVerification → false (только пока PAID)
    /// Побеждает ровно один: либо покупатель получает ключи, либо деньги, НИКОГДА оба.
    /// RequiresDeliveryVerification у возвращённого заказа не снимается — выдача заблокирована навсегда.
    /// </summary>
    public interface IUnverifiedOrderRefundService
    {
        Task<int> RunAsync();
    }

    public class UnverifiedOrderRefundService : IUnverifiedOrderRefundService
    {
        /// <summary>Совпадает с TTL токена подтверждения: истёк токен — истёк и заказ.</summary>
        public static readonly TimeSpan VerificationDeadline = TimeSpan.FromHours(48);

        private readonly IOrderRepository _orderRepository;
        private readonly IStripePaymentIntentGateway _paymentIntents;
        private readonly IDeliveryMailer _deliveryMailer;
        private readonly ILogger<UnverifiedOrderRefundService> _logger;
        private readonly IMongoCollection<PaymentFinalizationFailureDb> _paymentIssues;

        public UnverifiedOrderRefundService(
            IOrderRepository orderRepository,
            IStripePaymentIntentGateway paymentIntents,
            IDeliveryMailer deliveryMailer,
            ILogger<UnverifiedOrderRefundService> logger,
            IMongoDatabase database)
        {
            _orderRepository = orderRepository;
            _paymentIntents = paymentIntents;
            _deliveryMailer = deliveryMailer;
            _logger = logger;
            _paymentIssues = database.GetCollection<PaymentFinalizationFailureDb>("PaymentFinalizationFailures");
        }

        public async Task<int> RunAsync()
        {
            var cutoff = DateTime.UtcNow - VerificationDeadline;
            var candidates = await _orderRepository.GetUnverifiedGuestOrdersAsync(cutoff);
            var refunded = 0;

            foreach (var order in candidates)
            {
                try
                {
                    if (await RefundOrderAsync(order))
                    {
                        refunded++;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Auto-refund failed for order {OrderId}.", order.Id);
                    await RecordIssueAsync(order, $"{ex.GetType().Name}: {ex.Message}");
                }
            }

            if (refunded > 0)
            {
                _logger.LogInformation("Auto-refunded {Count} unverified guest orders.", refunded);
            }

            return refunded;
        }

        private async Task<bool> RefundOrderAsync(Order order)
        {
            if (string.IsNullOrWhiteSpace(order.PaymentIntentId))
            {
                return false; // возвращать нечем (не Stripe-заказ) — оставляем человеку
            }

            // Свежий кандидат — сначала атомарно занимаем под возврат. Проигрыш гонки означает,
            // что покупатель ТОЛЬКО ЧТО подтвердил почту — заказ ему, возврат отменяется.
            if (string.Equals(order.PaymentStatus, "PAID", StringComparison.OrdinalIgnoreCase)
                && !await _orderRepository.TryMarkRefundPendingAsync(order.Id.ToString()))
            {
                _logger.LogInformation("Order {OrderId}: buyer confirmed email just in time — auto-refund skipped.", order.Id);
                return false;
            }

            // Ключ детерминированный: повтор после сбоя не вернёт деньги дважды.
            var refundOk = await _paymentIntents.RefundPaymentIntentAsync(
                order.PaymentIntentId, $"auto_refund_{order.Id:N}");

            if (!refundOk)
            {
                // Заказ остаётся REFUND_PENDING — следующий часовой прогон повторит попытку.
                await RecordIssueAsync(order, "Stripe refund call failed; will retry next run.");
                return false;
            }

            // ВАЖНО: RequiresDeliveryVerification НЕ снимаем — гейт выдачи закрыт навсегда,
            // просроченный токен/бэкфилл уже никогда не выдадут ключи по возвращённому заказу.
            order.PaymentStatus = "REFUNDED";
            order.Status = "REFUNDED";
            order.UpdatedAt = DateTime.UtcNow;
            order.Events ??= new List<OrderEvent>();
            order.Events.Add(new OrderEvent
            {
                Type = "refund",
                Message = "Auto-refund: email was not confirmed within 48 hours",
                CreatedAt = DateTime.UtcNow
            });
            await _orderRepository.UpdateOrderAsync(order);

            try
            {
                await _deliveryMailer.SendAutoRefundNoticeAsync(order.UserId, order.OrderNumber ?? order.Id.ToString());
            }
            catch (Exception mailEx)
            {
                _logger.LogWarning(mailEx, "Auto-refund notice email failed for order {OrderId}.", order.Id);
            }

            _logger.LogInformation("Order {OrderId} auto-refunded: email not confirmed within {Deadline}.",
                order.Id, VerificationDeadline);
            return true;
        }

        private async Task RecordIssueAsync(Order order, string details)
        {
            var now = DateTime.UtcNow;
            var paymentIntentId = order.PaymentIntentId ?? order.Id.ToString();
            var update = Builders<PaymentFinalizationFailureDb>.Update
                .Set(item => item.UserId, order.UserId)
                .Set(item => item.OrderId, order.Id.ToString())
                .Set(item => item.LastSeenAt, now)
                .Set(item => item.ErrorCode, "AUTO_REFUND_FAILED")
                .Set(item => item.ErrorMessage, "Unverified guest order could not be auto-refunded. Refund manually in Stripe Dashboard.")
                .Set(item => item.TechnicalDetails, details)
                .Set(item => item.Status, "Open")
                .SetOnInsert(item => item.PaymentIntentId, paymentIntentId)
                .SetOnInsert(item => item.CreatedAt, now);

            await _paymentIssues.UpdateOneAsync(item => item.PaymentIntentId == paymentIntentId, update, new UpdateOptions { IsUpsert = true });
        }
    }
}
