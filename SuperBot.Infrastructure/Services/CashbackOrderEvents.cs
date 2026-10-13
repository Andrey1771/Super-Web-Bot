using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SuperBot.Core.Cashback;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Payments;

namespace SuperBot.Infrastructure.Services
{
    /// <summary>
    /// Что происходит с кэшбэком, когда что-то происходит с заказом: ключи выданы — начисляем,
    /// возврат — забираем (и возвращаем потраченное на заказ), спор по оплате — забираем, выигранный спор — отдаём обратно.
    /// </summary>
    public interface ICashbackOrderEvents : IOrderFulfillmentObserver
    {
        Task OnOrderRefundedAsync(Order order);
        Task OnOrderDisputedAsync(Order order);

        /// <summary>Спор выигран: деньги вернулись магазину — забранный при открытии спора кэшбэк возвращается покупателю.</summary>
        Task OnDisputeWonAsync(Order order);

        /// <summary>
        /// Приводит кэшбэк заказа в соответствие с его текущим состоянием. Идемпотентно — этим пользуется
        /// страховочная задача: хук мог не отработать (сбой, падение процесса), а заказ всё равно догонит своё.
        /// </summary>
        Task SyncOrderAsync(Order order);
    }

    public class CashbackOrderEvents : ICashbackOrderEvents
    {
        private readonly ICashbackLedger _ledger;
        private readonly ICashbackCurrency _currency;
        private readonly IOptionsMonitor<CashbackOptions> _options;
        private readonly ILogger<CashbackOrderEvents> _logger;

        public CashbackOrderEvents(
            ICashbackLedger ledger,
            ICashbackCurrency currency,
            IOptionsMonitor<CashbackOptions> options,
            ILogger<CashbackOrderEvents> logger)
        {
            _ledger = ledger;
            _currency = currency;
            _options = options;
            _logger = logger;
        }

        public Task OnOrderDeliveredAsync(Order order) => SafeAsync(order, "earn", () => EarnThenReverseAsync(order));

        public Task OnOrderRefundedAsync(Order order) => SafeAsync(order, "refund", () => ReverseAsync(order));

        public Task OnOrderDisputedAsync(Order order) => SafeAsync(order, "dispute", () => DisputeAsync(order));

        public Task OnDisputeWonAsync(Order order) => SafeAsync(order, "dispute won", () => RestoreAsync(order));

        public async Task SyncOrderAsync(Order order)
        {
            if (!Participates(order))
            {
                return;
            }

            if (IsDisputed(order))
            {
                await DisputeAsync(order);
                return;
            }

            if (DisputeWon(order))
            {
                await RestoreAsync(order);
            }
            // Сначала начисление за весь заказ, потом сторно возвращённой доли: частично возвращённый заказ
            // раньше не начислял ничего, и покупатель терял кэшбэк за то, что оставил и оплатил.
            if (order.IsFulfilled)
            {
                await EarnAsync(order);
            }
            if (RefundedFraction(order) > 0)
            {
                await ReverseAsync(order);
            }
        }

        /// <summary>Выдача завершилась: начисляем за заказ и сразу забираем долю, уже возвращённую по позициям.</summary>
        private async Task EarnThenReverseAsync(Order order)
        {
            await EarnAsync(order);
            if (RefundedFraction(order) > 0)
            {
                await ReverseAsync(order);
            }
        }

        private async Task RestoreAsync(Order order)
        {
            if (!Participates(order) || !DisputeWon(order) || RefundedFraction(order) > 0)
            {
                return;
            }
            await _ledger.RestoreOrderAsync(order.UserId, order.Id.ToString(), "Dispute won");
        }

        /// <summary>Спор закрыт в пользу магазина (или запрос банка закрыт без списания).</summary>
        private static bool DisputeWon(Order order) =>
            order.Dispute?.Outcome is "won" or "warning_closed";

        /// <summary>
        /// Участвует ли заказ в программе: оплачен картой на сайте, из аккаунта, программа включена.
        /// Решения от 14.09.2026: гости, крипта и Telegram Stars кэшбэка не получают.
        /// </summary>
        public bool Participates(Order order) =>
            order.IsPaid
            && !order.PlacedAsGuest
            && string.Equals(order.PaymentProvider, "stripe", StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(order.UserId)
            && _options.CurrentValue.Enabled;

        private async Task EarnAsync(Order order)
        {
            // Полностью возвращённый заказ не начисляет; частично возвращённый начисляет за весь заказ, а долю
            // возврата забирает ReverseAsync — так журнал одинаков независимо от порядка событий.
            if (!Participates(order) || !order.IsFulfilled || IsDisputed(order) || RefundedFraction(order) >= 1m)
            {
                return;
            }

            var paid = OrderTotal(order);
            var paidUsd = _currency.ToUsd(paid, order.Currency);
            if (paidUsd == null)
            {
                // Курса нет — не начисляем «на глаз»; страховочная задача повторит, когда курс появится.
                _logger.LogWarning("Cashback for order {OrderId} postponed: no FX rate for {Currency}.", order.Id, order.Currency);
                return;
            }

            await _ledger.EarnAsync(new CashbackEarnRequest
            {
                UserKey = order.UserId,
                OrderId = order.Id.ToString(),
                OrderNumber = order.OrderNumber,
                GameTitle = order.Items?.FirstOrDefault()?.Title is { Length: > 0 } title ? title : order.GameName,
                GameCoverUrl = order.Items?.FirstOrDefault()?.CoverUrl,
                PaidUsd = paidUsd.Value,
                OrderTotal = paid,
                OrderCurrency = order.Currency,
                OrderedAt = OrderedAt(order)
            });
        }

        private async Task ReverseAsync(Order order)
        {
            var fraction = RefundedFraction(order);
            if (!Participates(order) || fraction <= 0)
            {
                return;
            }
            await _ledger.ReverseOrderAsync(order.UserId, order.Id.ToString(), fraction);
        }

        private async Task DisputeAsync(Order order)
        {
            if (!Participates(order))
            {
                return;
            }
            // Спор ещё не решён, деньги покупателю формально не вернули — поэтому забираем только
            // начисленное, а потраченный на заказ кэшбэк не возвращаем. Выигранный спор админ
            // возмещает ручной правкой.
            await _ledger.ReverseOrderAsync(order.UserId, order.Id.ToString(), 1m, returnSpent: false);
        }

        private async Task SafeAsync(Order order, string action, Func<Task> run)
        {
            try
            {
                await run();
            }
            catch (Exception ex)
            {
                // Кэшбэк не должен ронять выдачу ключей или возврат. Пропущенное догонит страховочная задача.
                _logger.LogError(ex, "Cashback {Action} failed for order {OrderId}; the hourly sync will retry.", action, order.Id);
            }
        }

        private static DateTime OrderedAt(Order order) =>
            order.PaidAt ?? (order.CreatedAt != default ? order.CreatedAt : order.OrderDate);

        private static decimal OrderTotal(Order order) =>
            order.Totals?.Total is > 0 ? order.Totals.Total : order.TotalAmount ?? 0m;

        private static bool IsDisputed(Order order) =>
            string.Equals(order.PaymentStatus, PaymentReconciliationService.PaymentStatusDisputed, StringComparison.OrdinalIgnoreCase);

        /// <summary>Какая доля заказа возвращена: 1 — полностью, 0 — нисколько. Правило общее с налогом.</summary>
        private static decimal RefundedFraction(Order order) => OrderRefunds.Fraction(order);
    }

    /// <summary>
    /// Страховочная задача: раз в час проходит по заказам и приводит кэшбэк в соответствие с ними.
    /// Хуки срабатывают сразу, но между сохранением заказа и записью в журнал процесс может упасть,
    /// а часть изменений заказа (например, ручная смена статуса) хуков не зовёт вовсе.
    /// </summary>
    public interface ICashbackSyncService
    {
        Task RunAsync();
    }

    public class CashbackSyncService : ICashbackSyncService
    {
        /// <summary>Глубже не смотрим: возвраты и споры приходят в пределах нескольких месяцев.</summary>
        private static readonly TimeSpan Lookback = TimeSpan.FromDays(120);

        /// <summary>Резерв без движения дольше — проверяем, жив ли платёж.</summary>
        private static readonly TimeSpan StaleAfter = TimeSpan.FromHours(1);
        /// <summary>Незавершённый платёж дольше — считаем брошенным и возвращаем кэшбэк на баланс.</summary>
        private static readonly TimeSpan AbandonedAfter = TimeSpan.FromHours(48);

        private readonly IOrderRepository _orders;
        private readonly ICashbackOrderEvents _events;
        private readonly ICashbackLedger _ledger;
        private readonly IStripePaymentIntentGateway _paymentIntents;
        private readonly IOptionsMonitor<CashbackOptions> _options;
        private readonly ILogger<CashbackSyncService> _logger;

        public CashbackSyncService(
            IOrderRepository orders,
            ICashbackOrderEvents events,
            ICashbackLedger ledger,
            IStripePaymentIntentGateway paymentIntents,
            IOptionsMonitor<CashbackOptions> options,
            ILogger<CashbackSyncService> logger)
        {
            _orders = orders;
            _events = events;
            _ledger = ledger;
            _paymentIntents = paymentIntents;
            _options = options;
            _logger = logger;
        }

        public async Task RunAsync()
        {
            // Зависшие резервы снимаем и при выключенной программе: деньги покупателя не должны
            // оставаться замороженными под платёж, который никогда не случится.
            await ReleaseAbandonedReservationsAsync();

            var options = _options.CurrentValue;
            if (!options.Enabled)
            {
                return;
            }

            var since = DateTime.UtcNow - Lookback;
            var orders = await _orders.GetPaidOrdersSinceAsync(since);
            var failed = 0;
            foreach (var order in orders)
            {
                try
                {
                    await _events.SyncOrderAsync(order);
                }
                catch (Exception ex)
                {
                    failed++;
                    _logger.LogError(ex, "Cashback sync failed for order {OrderId}", order.Id);
                }
            }

            _logger.LogInformation("Cashback sync checked {Count} orders, {Failed} failed.", orders.Count, failed);
        }

        /// <summary>
        /// Покупатель включил оплату кэшбэком и ушёл, не заплатив, — отложенное возвращается на баланс.
        /// Успешный платёж не трогаем: его резерв спишет финализация заказа.
        /// </summary>
        public async Task ReleaseAbandonedReservationsAsync()
        {
            var now = DateTime.UtcNow;
            var released = 0;
            foreach (var reservation in await _ledger.GetStaleReservationsAsync(now - StaleAfter))
            {
                var reference = reservation.Reference;
                if (string.IsNullOrWhiteSpace(reference))
                {
                    continue;
                }

                try
                {
                    // Временная ссылка так и не стала платежом (процесс упал между резервом и созданием намерения).
                    var abandoned = reference.StartsWith("chk_", StringComparison.Ordinal);
                    if (!abandoned)
                    {
                        var intent = await _paymentIntents.GetAsync(reference);
                        var status = intent?.Status ?? "canceled";
                        if (status is "succeeded" or "processing")
                        {
                            continue;
                        }
                        abandoned = status == "canceled"
                                    || (reservation.UpdatedAt ?? reservation.CreatedAt) < now - AbandonedAfter;
                    }

                    if (abandoned && await _ledger.ReleaseAsync(reference))
                    {
                        released++;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Could not check cashback reservation {Reference}", reference);
                }
            }

            if (released > 0)
            {
                _logger.LogInformation("Released {Count} abandoned cashback reservations.", released);
            }
        }
    }
}
