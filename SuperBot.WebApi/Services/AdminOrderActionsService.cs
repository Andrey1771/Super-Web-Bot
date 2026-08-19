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
    private readonly ILogger<AdminOrderActionsService> _logger;

    public AdminOrderActionsService(
        IOrderRepository orders,
        IGameKeyRepository keys,
        IKeyFulfillmentService fulfillment,
        IDeliveryMailer mailer,
        IStripePaymentIntentGateway stripe,
        ILogger<AdminOrderActionsService> logger)
    {
        _orders = orders;
        _keys = keys;
        _fulfillment = fulfillment;
        _mailer = mailer;
        _stripe = stripe;
        _logger = logger;
    }

    // ---------- переотправить ключи ----------

    /// <summary>
    /// Ещё раз отправить письмом уже выданные ключи. Самый частый тикет: «письмо не пришло».
    /// Ничего в заказе не меняет, кроме записи в журнале.
    /// </summary>
    public async Task<ActionOutcome> ResendKeysAsync(Order order, string actor)
    {
        if (!LooksLikeEmail(order.UserId))
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
            KeyDeliveryProgress.FromOrder(order));

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

        if (LooksLikeEmail(order.UserId))
        {
            try
            {
                await _mailer.SendGameKeysAsync(order.UserId, order.OrderNumber ?? order.Id.ToString(), newlyDelivered,
                    KeyDeliveryReceipt.FromOrder(order), KeyDeliveryProgress.FromOrder(order));
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

        ApplyRefunded(order, actor, $"Refunded via Stripe. Reason: {reason}");
        await _orders.UpdateOrderAsync(order);
        await NotifyRefundAsync(order);
        return ActionOutcome.Ok("Refund sent to Stripe; the order is marked REFUNDED.");
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

        ApplyRefunded(order, actor, $"Marked as refunded outside the system. {reason}");
        await _orders.UpdateOrderAsync(order);
        await NotifyRefundAsync(order);
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
        var result = new List<DeliveredKeyNotification>();
        var used = new HashSet<string>();

        foreach (var item in order.Items ?? new List<OrderItemSnapshot>())
        {
            foreach (var delivered in item.Delivery?.Keys ?? new List<DeliveredKey>())
            {
                var match = userKeys.FirstOrDefault(k =>
                    string.Equals(k.GameId, item.GameId, StringComparison.OrdinalIgnoreCase)
                    && !used.Contains(k.Key)
                    && MaskMatches(k.Key, delivered.KeyMasked));
                if (match is null)
                {
                    continue;
                }
                used.Add(match.Key);
                result.Add(new DeliveredKeyNotification(
                    string.IsNullOrWhiteSpace(item.Title) ? order.GameName : item.Title, match.Key, match.KeyType));
            }
        }
        return result;
    }

    private static bool MaskMatches(string plain, string? mask)
    {
        if (string.IsNullOrWhiteSpace(plain) || string.IsNullOrWhiteSpace(mask))
        {
            return false;
        }
        var trimmed = plain.Trim();
        if (trimmed.Length != mask.Length)
        {
            return false;
        }
        var tail = trimmed.Length <= 4 ? trimmed : trimmed[^4..];
        return mask.EndsWith(tail, StringComparison.Ordinal);
    }

    private static bool IsRefunded(Order order) =>
        string.Equals(order.Status, "REFUNDED", StringComparison.OrdinalIgnoreCase)
        || string.Equals(order.PaymentStatus, "REFUNDED", StringComparison.OrdinalIgnoreCase);

    private static void ApplyRefunded(Order order, string actor, string message)
    {
        order.Status = "REFUNDED";
        order.PaymentStatus = "REFUNDED";
        order.UpdatedAt = DateTime.UtcNow;
        AddEvent(order, "refund", message, actor);
    }

    private async Task NotifyRefundAsync(Order order)
    {
        if (!LooksLikeEmail(order.UserId))
        {
            return;
        }
        try
        {
            await _mailer.SendAutoRefundNoticeAsync(order.UserId, order.OrderNumber ?? order.Id.ToString());
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Refund notice e-mail failed for order {OrderId}.", order.Id);
        }
    }

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

    private static void AddEvent(Order order, string type, string message, string actor)
    {
        order.Events ??= new List<OrderEvent>();
        order.Events.Add(new OrderEvent { Type = type, Message = message, Actor = actor, CreatedAt = DateTime.UtcNow });
    }

    private static bool LooksLikeEmail(string? value) => !string.IsNullOrWhiteSpace(value) && value.Contains('@');
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
