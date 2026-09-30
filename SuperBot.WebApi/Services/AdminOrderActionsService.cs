using SuperBot.Core.Payments;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Services;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Действия специалиста над заказом. Каждое — отдельная операция со своими предусловиями и
/// своей записью в журнал заказа, а не «поставить статус X».
///
/// Раньше в админке был свободный select из восьми статусов: можно было поставить DELIVERED,
/// не выдав ключ, и REFUNDED, не вернув деньги — и в базе это выглядело как правда. Здесь
/// статус — следствие действия: возврат ставит REFUNDED только когда Stripe подтвердил деньги,
/// выдача ставит DELIVERED только когда ключ реально ушёл. Свободная смена статуса осталась
/// одна, ForceStatusAsync, с обязательной причиной — как аварийный инструмент.
/// </summary>
public sealed class AdminOrderActionsService
{
    private readonly IOrderRepository _orders;
    private readonly IGameKeyRepository _keys;
    private readonly IKeyFulfillmentService _fulfillment;
    private readonly IDeliveryMailer _mailer;
    private readonly IStripePaymentIntentGateway _stripe;
    private readonly IPurchaseAnalytics _analytics;
    private readonly ILogger<AdminOrderActionsService> _logger;
    private readonly ICashbackOrderEvents _cashback;
    private readonly IOrderTaxService _tax;
    private readonly IGameReviewRepository _reviews;

    public AdminOrderActionsService(
        IOrderRepository orders,
        IGameKeyRepository keys,
        IKeyFulfillmentService fulfillment,
        IDeliveryMailer mailer,
        IStripePaymentIntentGateway stripe,
        IPurchaseAnalytics analytics,
        ILogger<AdminOrderActionsService> logger,
        ICashbackOrderEvents cashback,
        IOrderTaxService tax,
        IGameReviewRepository reviews)
    {
        _cashback = cashback;
        _tax = tax;
        _reviews = reviews;
        _orders = orders;
        _keys = keys;
        _fulfillment = fulfillment;
        _mailer = mailer;
        _stripe = stripe;
        _analytics = analytics;
        _logger = logger;
    }

    // ---------- переотправить ключи ----------

    /// <summary>
    /// Ещё раз отправить письмом уже выданные ключи. Самый частый тикет: «письмо не пришло».
    /// Ничего в заказе не меняет, кроме записи в журнале.
    /// </summary>
    public async Task<ActionOutcome> ResendKeysAsync(Order order, string actor)
    {
        if (!EmailAddress.LooksLikeEmail(order.UserId))
        {
            return ActionOutcome.Refuse("This order has no e-mail to send to (Telegram or legacy account).");
        }

        var delivered = await ResolveDeliveredKeysAsync(order);
        if (delivered.Count == 0)
        {
            return ActionOutcome.Refuse("No keys have been delivered on this order yet — use “Deliver keys” instead.");
        }

        await _mailer.SendGameKeysAsync(
            order.UserId,
            order.OrderNumber ?? order.Id.ToString(),
            delivered,
            KeyDeliveryReceipt.FromOrder(order),
            KeyDeliveryProgress.FromOrder(order),
            locale: order.Language);

        AddEvent(order, "keys_resent", $"Keys re-sent to {order.UserId} ({delivered.Count})", actor);
        await _orders.UpdateOrderAsync(order);
        return ActionOutcome.Ok($"Sent {delivered.Count} key(s) to {order.UserId}.");
    }

    // ---------- выдать ключи ----------

    /// <summary>
    /// Выдать недостающие ключи из пула прямо сейчас — для оплаченного заказа, который ждёт.
    /// Идёт через тот же <see cref="IKeyFulfillmentService"/>, что и автоматическая выдача,
    /// поэтому статус, маскировка и уведомление бота получаются те же самые.
    /// </summary>
    public async Task<ActionOutcome> DeliverKeysAsync(Order order, string actor)
    {
        if (!order.IsPaid && !string.Equals(order.PaymentStatus, "PAID", StringComparison.OrdinalIgnoreCase))
        {
            return ActionOutcome.Refuse("Order is not paid — keys can only be delivered on paid orders.");
        }
        if (order.RequiresDeliveryVerification)
        {
            return ActionOutcome.Refuse("Guest has not confirmed the e-mail yet — delivery is blocked until they do.");
        }
        if (order.IsFulfilled)
        {
            return ActionOutcome.Refuse("All keys are already delivered — use “Resend keys” if the customer lost them.");
        }

        var newlyDelivered = await _fulfillment.FulfillOrderAsync(order, actor);
        if (newlyDelivered.Count == 0)
        {
            return ActionOutcome.Refuse("No keys in stock for the games on this order — add keys in Game keys first.");
        }

        if (EmailAddress.LooksLikeEmail(order.UserId))
        {
            try
            {
                await _mailer.SendGameKeysAsync(order.UserId, order.OrderNumber ?? order.Id.ToString(), newlyDelivered,
                    KeyDeliveryReceipt.FromOrder(order), KeyDeliveryProgress.FromOrder(order), locale: order.Language);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Manual delivery e-mail failed for order {OrderId}.", order.Id);
            }
        }

        // FulfillOrderAsync уже сохранил заказ и записал событие fulfillment; дописываем, кто нажал.
        var fresh = await _orders.GetOrderByIdAsync(order.Id.ToString()) ?? order;
        AddEvent(fresh, "keys_delivered_manually", $"{newlyDelivered.Count} key(s) delivered by hand", actor);
        await _orders.UpdateOrderAsync(fresh);

        return ActionOutcome.Ok(fresh.IsFulfilled
            ? $"Delivered {newlyDelivered.Count} key(s); order is complete."
            : $"Delivered {newlyDelivered.Count} key(s); the rest still waits for stock.");
    }

    // ---------- возврат ----------

    /// <summary>
    /// Полный возврат денег. Для Stripe — вызов Refunds API с детерминированным ключом
    /// идемпотентности; статус REFUNDED ставится сразу по успешному ответу, вебхук
    /// charge.refunded потом придёт и не сделает ничего лишнего (ApplyRefundAsync идемпотентен).
    /// Другие рельсы (Stars, крипта) вернуть отсюда нельзя — для них есть MarkRefundedAsync.
    /// </summary>
    public async Task<ActionOutcome> RefundAsync(Order order, string actor, string reason)
    {
        if (string.IsNullOrWhiteSpace(reason))
        {
            return ActionOutcome.Refuse("A reason is required for a refund.");
        }
        if (IsRefunded(order))
        {
            return ActionOutcome.Refuse("This order is already refunded.");
        }
        if (!order.IsPaid && !string.Equals(order.PaymentStatus, "PAID", StringComparison.OrdinalIgnoreCase))
        {
            return ActionOutcome.Refuse("Order was never paid — cancel it instead.");
        }
        if (string.IsNullOrWhiteSpace(order.PaymentIntentId) || !string.Equals(order.PaymentProvider, "stripe", StringComparison.OrdinalIgnoreCase))
        {
            return ActionOutcome.Refuse($"Automatic refund works for Stripe only; this order was paid via {order.PaymentProvider}. Refund it in the provider’s dashboard, then use “Mark as refunded”.");
        }

        var ok = await _stripe.RefundPaymentIntentAsync(order.PaymentIntentId, $"admin_refund_{order.Id:N}");
        if (!ok)
        {
            AddEvent(order, "refund_failed", $"Stripe refund call failed. Reason given: {reason}", actor);
            await _orders.UpdateOrderAsync(order);
            return ActionOutcome.Fail("Stripe did not accept the refund. Check the Stripe dashboard; nothing was changed on the order.");
        }

        var fractionBefore = OrderRefunds.Fraction(order);
        var cardBefore = order.RefundedAmount ?? 0m;
        ApplyRefunded(order, actor, $"Refunded via Stripe. Reason: {reason}");
        await _orders.UpdateOrderAsync(order);
        await MarkReviewsRefundedAsync(order);
        // Статус проставлен здесь, и пришедший следом charge.refunded выйдет по идемпотентности —
        // поэтому кэшбэк за заказ забираем отсюда.
        await _cashback.OnOrderRefundedAsync(order);
        await _tax.OnOrderRefundedAsync(order);
        // Статус проставлен сразу, поэтому пришедший следом charge.refunded промолчит —
        // сообщаем аналитике здесь, иначе возврат из админки не попал бы в неё вообще.
        await _analytics.TrackRefundAsync(order, order.TotalAmount ?? 0m, true);
        await NotifyShopRefundAsync(order, full: true, RemainingLines(order), (order.RefundedAmount ?? 0m) - cardBefore, CashbackBack(order, fractionBefore, 1m));
        return ActionOutcome.Ok("Refund sent to Stripe; the order is marked REFUNDED.");
    }

    /// <summary>
    /// Вернуть одну позицию заказа (или несколько её штук). На карту уходит пропорциональная часть списанного,
    /// кэшбэк и налог — по точной доле стоимости заказа (<see cref="OrderRefunds.Plan"/>). Ключи не отзываются:
    /// выданный ключ уже у покупателя, и решать, что с ним делать, — человеку.
    /// </summary>
    public async Task<ActionOutcome> RefundItemAsync(Order order, string actor, string itemId, int quantity, string reason)
    {
        if (string.IsNullOrWhiteSpace(reason))
        {
            return ActionOutcome.Refuse("A reason is required for a refund.");
        }
        if (IsRefunded(order))
        {
            return ActionOutcome.Refuse("This order is already refunded.");
        }
        if (!order.IsPaid && !string.Equals(order.PaymentStatus, "PAID", StringComparison.OrdinalIgnoreCase))
        {
            return ActionOutcome.Refuse("Order was never paid — cancel it instead.");
        }
        if (string.IsNullOrWhiteSpace(order.PaymentIntentId) || !string.Equals(order.PaymentProvider, "stripe", StringComparison.OrdinalIgnoreCase))
        {
            return ActionOutcome.Refuse("Refunding a single item works for Stripe orders only. Refund other payments in the provider’s dashboard, then use “Mark as refunded”.");
        }
        if (order.Dispute is { ClosedAt: null })
        {
            return ActionOutcome.Refuse("This payment is disputed — the bank decides on the money now. Refund after the dispute closes.");
        }

        var item = (order.Items ?? new List<OrderItemSnapshot>()).FirstOrDefault(line => string.Equals(line.ItemId, itemId, StringComparison.Ordinal));
        if (item is null)
        {
            return ActionOutcome.Refuse("This item is not on the order.");
        }
        var left = OrderRefunds.Refundable(item);
        if (quantity < 1 || quantity > left)
        {
            return ActionOutcome.Refuse(left == 0
                ? "This item is already refunded."
                : $"You can refund from 1 to {left} of this item.");
        }

        var currency = string.IsNullOrWhiteSpace(order.Currency) ? "USD" : order.Currency;
        var fractionBefore = OrderRefunds.Fraction(order);
        var plan = OrderRefunds.Plan(order, item, quantity,
            amount => CurrencyMinorUnits.FromMinor((long)Math.Floor(amount * CurrencyMinorUnits.ToMinor(1m, currency)), currency));
        if (plan is null)
        {
            return ActionOutcome.Refuse("This order has no item prices to split the refund by — use the full refund instead.");
        }

        var refundedAfter = item.RefundedQuantity + quantity;
        var toCardMinor = CurrencyMinorUnits.ToMinor(plan.ToCard, currency);
        var money = (decimal amount) => $"{amount:0.00} {currency.ToUpperInvariant()}";
        var cashbackPart = plan.LineValue - plan.ToCard;
        var summary = $"{quantity} × {item.Title} ({money(plan.LineValue)}): {money(plan.ToCard)} to the card"
            + (order.CashbackApplied > 0 && cashbackPart > 0 ? ", the rest as cashback" : string.Empty);

        // Состояние возврата ложится в заказ ДО обращения в Stripe (как у налоговой транзакции). Возврат необратим:
        // если ответ Stripe потеряется после того, как деньги ушли, повтор увидит позицию уже возвращённой и не вернёт
        // их второй раз, а событие refund_pending подскажет админу сверить сумму в кабинете Stripe. Не принял Stripe —
        // откатываем поля назад.
        var before = (item.RefundedQuantity, order.RefundedShare, order.RefundedAmount, order.Status, order.PaymentStatus, order.UpdatedAt);
        item.RefundedQuantity = refundedAfter;
        order.RefundedShare = plan.Share;
        order.RefundedAmount = (order.RefundedAmount ?? 0m) + plan.ToCard;
        if (plan.AllItemsRefunded)
        {
            order.Status = "REFUNDED";
            order.PaymentStatus = "REFUNDED";
        }
        else
        {
            order.PaymentStatus = "PARTIALLY_REFUNDED";
        }
        order.UpdatedAt = DateTime.UtcNow;
        var pending = AddEvent(order, "refund_pending", $"Refunding {summary}. Reason: {reason}", actor);
        await _orders.UpdateOrderAsync(order);

        if (plan.ToCard > 0)
        {
            // Ключ — позиция, сколько её штук будет возвращено и сумма: повтор того же запроса не вернёт деньги дважды,
            // а возврат с другой суммой (после других возвратов по заказу) не упрётся в чужой ключ.
            bool ok;
            try
            {
                ok = await _stripe.RefundPaymentIntentAsync(
                    order.PaymentIntentId,
                    $"admin_refund_item_{order.Id:N}_{item.ItemId}_{refundedAfter}_{toCardMinor}",
                    toCardMinor);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Stripe refund for item {ItemId} of order {OrderId} failed.", item.ItemId, order.Id);
                ok = false;
            }
            if (!ok)
            {
                (item.RefundedQuantity, order.RefundedShare, order.RefundedAmount, order.Status, order.PaymentStatus, order.UpdatedAt) = before;
                pending.Type = "refund_failed";
                pending.Message = $"Stripe refund for {quantity} × {item.Title} failed. Reason given: {reason}";
                await _orders.UpdateOrderAsync(order);
                return ActionOutcome.Fail("Stripe did not accept the refund. Check the Stripe dashboard; nothing was changed on the order.");
            }
        }

        pending.Type = "refund";
        pending.Message = $"Refunded {summary}. Reason: {reason}";
        await _orders.UpdateOrderAsync(order);
        await MarkReviewsRefundedAsync(order);

        // Заказ ещё ждал ключи: оставшиеся позиции могли быть уже выданы, и тогда заказ теперь выдан целиком — статус
        // и кэшбэк за оставшееся считает та же выдача (возвращённые строки она больше не ждёт). Выданный заказ не
        // трогаем: у старых заказов без снимков ключей повторный пересчёт вернул бы его в ожидание.
        if (!plan.AllItemsRefunded && !order.IsFulfilled)
        {
            await _fulfillment.FulfillOrderAsync(order, actor);
        }

        // Charge.refunded от Stripe придёт следом с той же суммой и выйдет по идемпотентности — поэтому кэшбэк, налог
        // и аналитику двигаем отсюда, как и при полном возврате.
        await _cashback.OnOrderRefundedAsync(order);
        await _tax.OnOrderRefundedAsync(order);
        await _analytics.TrackRefundAsync(order, plan.ToCard, plan.AllItemsRefunded);
        // Письмо — на каждый возврат: покупатель должен знать, что вернули и куда, даже если это одна позиция из трёх.
        await NotifyShopRefundAsync(order, plan.AllItemsRefunded,
            new[] { new RefundedLine(LineTitle(item), quantity) },
            plan.ToCard,
            CashbackBack(order, fractionBefore, plan.Share));

        return ActionOutcome.Ok(plan.AllItemsRefunded
            ? "Last item refunded; the order is marked REFUNDED."
            : plan.ToCard > 0
                ? $"Refunded {money(plan.ToCard)} to the card."
                : "Nothing to send to the card — this part was paid with cashback, which is returned to the balance.");
    }

    /// <summary>
    /// Пометить возвращённым то, что вернули вне системы (Stars, крипта, вручную в кабинете
    /// провайдера). Денег не двигает — только фиксирует факт с причиной и автором.
    /// </summary>
    public async Task<ActionOutcome> MarkRefundedAsync(Order order, string actor, string reason)
    {
        if (string.IsNullOrWhiteSpace(reason))
        {
            return ActionOutcome.Refuse("Say where and how the money was returned — this is the only record of it.");
        }
        if (IsRefunded(order))
        {
            return ActionOutcome.Refuse("This order is already refunded.");
        }

        var fractionBefore = OrderRefunds.Fraction(order);
        var paidBefore = order.RefundedAmount ?? 0m;
        ApplyRefunded(order, actor, $"Marked as refunded outside the system. {reason}");
        await _orders.UpdateOrderAsync(order);
        await MarkReviewsRefundedAsync(order);
        await _cashback.OnOrderRefundedAsync(order);
        await _tax.OnOrderRefundedAsync(order);
        // Возврат по чужим рельсам (Stars, крипта): вебхука Stripe не будет, и если не сообщить
        // отсюда, во внешней аналитике эти деньги так и останутся выручкой.
        await _analytics.TrackRefundAsync(order, order.TotalAmount ?? 0m, true);
        // Деньги вернули по чужим рельсам — письмо говорит «тем же способом, что платили», а не «на карту».
        await NotifyShopRefundAsync(order, full: true, RemainingLines(order), (order.RefundedAmount ?? 0m) - paidBefore,
            CashbackBack(order, fractionBefore, 1m), viaCard: false);
        return ActionOutcome.Ok("Order marked REFUNDED.");
    }

    // ---------- отмена ----------

    /// <summary>Отменить неоплаченный заказ. Оплаченный отменять нельзя — для него есть возврат.</summary>
    public async Task<ActionOutcome> CancelAsync(Order order, string actor, string? reason)
    {
        if (order.IsPaid || string.Equals(order.PaymentStatus, "PAID", StringComparison.OrdinalIgnoreCase))
        {
            return ActionOutcome.Refuse("Paid orders cannot be cancelled — refund them instead.");
        }
        if (string.Equals(order.Status, "CANCELLED", StringComparison.OrdinalIgnoreCase))
        {
            return ActionOutcome.Refuse("Order is already cancelled.");
        }

        order.Status = "CANCELLED";
        order.FulfillmentStatus = "CANCELLED";
        order.UpdatedAt = DateTime.UtcNow;
        AddEvent(order, "cancelled", string.IsNullOrWhiteSpace(reason) ? "Cancelled by staff" : $"Cancelled by staff: {reason}", actor);
        await _orders.UpdateOrderAsync(order);
        return ActionOutcome.Ok("Order cancelled.");
    }

    // ---------- аварийная смена статуса ----------

    /// <summary>
    /// Прямая смена статуса без проверок. Осталась одна: когда реальность разошлась с базой
    /// (деньги вернули в кабинете год назад, ключ отдали в переписке). Причина обязательна и
    /// уходит в журнал вместе с автором — иначе через месяц никто не вспомнит, откуда статус.
    /// </summary>
    public async Task<ActionOutcome> ForceStatusAsync(Order order, string actor, string status, string reason)
    {
        if (string.IsNullOrWhiteSpace(reason))
        {
            return ActionOutcome.Refuse("A reason is required to force a status.");
        }

        var normalized = status.Trim().ToUpperInvariant();
        var previous = order.Status ?? "(none)";
        ApplyStatusBlindly(order, normalized);
        order.UpdatedAt = DateTime.UtcNow;
        AddEvent(order, "status_forced", $"Status forced {previous} → {normalized}. Reason: {reason}", actor);
        await _orders.UpdateOrderAsync(order);
        // Аварийная смена статуса тоже может означать возврат — приводим кэшбэк к новому состоянию.
        try
        {
            await _cashback.SyncOrderAsync(order);
        }
        catch (Exception ex)
        {
            // Статус уже сохранён; кэшбэк догонит ежечасная задача.
            _logger.LogError(ex, "Cashback sync after forced status failed for order {OrderId}", order.Id);
        }
        // И налог: принудительный REFUNDED должен сторнировать транзакцию. Сбой — не беда, повторит сверка.
        await _tax.OnOrderRefundedAsync(order);
        return ActionOutcome.Ok($"Status set to {normalized}.");
    }

    // ---------- helpers ----------

    /// <summary>
    /// Открытые ключи выданного заказа. В самом заказе лежат только маски (последние четыре
    /// символа), plaintext — в коллекции ключей клиента; сопоставляем по игре и по маске.
    /// </summary>
    private async Task<List<DeliveredKeyNotification>> ResolveDeliveredKeysAsync(Order order)
    {
        var userKeys = await _keys.GetByUserAsync(order.UserId, 500);
        return OrderDeliveredKeys.Resolve(order, userKeys).Select(entry => entry.Key).ToList();
    }

    private static bool IsRefunded(Order order) =>
        string.Equals(order.Status, "REFUNDED", StringComparison.OrdinalIgnoreCase)
        || string.Equals(order.PaymentStatus, "REFUNDED", StringComparison.OrdinalIgnoreCase);

    private static void ApplyRefunded(Order order, string actor, string message)
    {
        order.Status = "REFUNDED";
        order.PaymentStatus = "REFUNDED";
        // Полный возврат — вернули всю сумму заказа. Totals.Total точнее устаревшего
        // TotalAmount, но у старых заказов он нулевой, поэтому берём то, что заполнено.
        order.RefundedAmount = order.Totals?.Total is > 0 ? order.Totals.Total : order.TotalAmount ?? 0m;
        order.UpdatedAt = DateTime.UtcNow;
        AddEvent(order, "refund", message, actor);
    }

    /// <summary>Письмо о возврате, сделанном магазином. Сбой почты возврат не отменяет — только пишется в лог.</summary>
    private async Task NotifyShopRefundAsync(Order order, bool full, IReadOnlyList<RefundedLine> items, decimal toCard, decimal toCashback, bool viaCard = true)
    {
        if (!EmailAddress.LooksLikeEmail(order.UserId))
        {
            return;
        }
        try
        {
            await _mailer.SendRefundNoticeAsync(order.UserId, new OrderRefundNotice(
                order.OrderNumber ?? order.Id.ToString(),
                full,
                items,
                Math.Max(0m, toCard),
                Math.Max(0m, toCashback),
                string.IsNullOrWhiteSpace(order.Currency) ? "USD" : order.Currency,
                viaCard,
                viaCard ? PaymentInstrument.Describe(order) : null),
                locale: order.Language);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Refund notice e-mail failed for order {OrderId}.", order.Id);
        }
    }

    /// <summary>
    /// Сколько кэшбэка вернулось на баланс этим возвратом, в валюте заказа: оплаченное кэшбэком в той же доле, что и журнал
    /// (<see cref="OrderRefunds.Fraction"/> до и после). Письмо — не бухгалтерия, но число должно совпадать с кабинетом.
    /// </summary>
    private static decimal CashbackBack(Order order, decimal fractionBefore, decimal fractionAfter) =>
        order.CashbackApplied <= 0 ? 0m : Math.Round(order.CashbackApplied * Math.Max(0m, fractionAfter - fractionBefore), 2, MidpointRounding.AwayFromZero);

    /// <summary>Позиции, ещё не возвращённые по отдельности, — что вернул полный возврат.</summary>
    private static IReadOnlyList<RefundedLine> RemainingLines(Order order) =>
        (order.Items ?? new List<OrderItemSnapshot>())
            .Where(item => OrderRefunds.Refundable(item) > 0)
            .Select(item => new RefundedLine(LineTitle(item), OrderRefunds.Refundable(item)))
            .ToList();

    private static string LineTitle(OrderItemSnapshot item) =>
        string.IsNullOrWhiteSpace(item.EditionTitle) ? item.Title : $"{item.Title} — {item.EditionTitle}";

    private static void ApplyStatusBlindly(Order order, string status)
    {
        order.Status = status;
        order.PaymentStatus = status switch
        {
            "PAID" or "PROCESSING" or "AWAITING_KEYS" or "DELIVERED" => "PAID",
            "REFUNDED" => "REFUNDED",
            "FAILED" => "FAILED",
            _ => "UNPAID"
        };
        order.FulfillmentStatus = status switch
        {
            "DELIVERED" => "DELIVERED",
            "PROCESSING" or "AWAITING_KEYS" => "IN_PROGRESS",
            "CANCELLED" => "CANCELLED",
            _ => "NOT_STARTED"
        };
        order.IsPaid = status is "PAID" or "PROCESSING" or "AWAITING_KEYS" or "DELIVERED";
        order.IsFulfilled = status == "DELIVERED";
    }

    /// <summary>Отзывы покупателя на возвращённые игры получают пометку «Refunded» — остаются и считаются.</summary>
    private async Task MarkReviewsRefundedAsync(Order order)
    {
        var gameIds = SuperBot.Core.Services.RefundedPurchases.GameIds(order);
        if (gameIds.Count == 0 || string.IsNullOrWhiteSpace(order.UserName))
        {
            return;
        }
        try
        {
            await _reviews.MarkRefundedAsync(order.UserName, gameIds.ToList());
        }
        catch (Exception ex)
        {
            // Пометка — не часть возврата денег: её сбой возврат не отменяет.
            _logger.LogWarning(ex, "Could not mark reviews refunded for order {OrderId}", order.Id);
        }
    }

    private static OrderEvent AddEvent(Order order, string type, string message, string actor)
    {
        order.Events ??= new List<OrderEvent>();
        var created = new OrderEvent { Type = type, Message = message, Actor = actor, CreatedAt = DateTime.UtcNow };
        order.Events.Add(created);
        return created;
    }

}

/// <summary>Результат действия: получилось / отказано по предусловию / упало у провайдера.</summary>
public sealed record ActionOutcome(bool Success, int StatusCode, string Message)
{
    public static ActionOutcome Ok(string message) => new(true, 200, message);
    /// <summary>Предусловие не выполнено — 409, это не ошибка сервера, а «так нельзя из этого состояния».</summary>
    public static ActionOutcome Refuse(string message) => new(false, 409, message);
    /// <summary>Внешний провайдер не принял — 502.</summary>
    public static ActionOutcome Fail(string message) => new(false, 502, message);
}
