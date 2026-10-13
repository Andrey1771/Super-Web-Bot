using SuperBot.Core.Entities;

namespace SuperBot.Core.Services;

/// <summary>
/// Какие игры заказа возвращены — для пометки «Refunded» у отзыва. Отзыв при возврате не
/// удаляется и в оценке остаётся (человек играл, это отзыв на игру), как у Steam; пометка
/// лишь честно говорит читателю, что покупку вернули.
/// </summary>
public static class RefundedPurchases
{
    /// <summary>Игры, чья покупка в этом заказе возвращена целиком: весь заказ или все штуки позиции.</summary>
    public static IReadOnlySet<string> GameIds(Order? order)
    {
        var result = new HashSet<string>(StringComparer.Ordinal);
        if (order is null)
        {
            return result;
        }

        var wholeOrder = string.Equals(order.Status, "REFUNDED", StringComparison.OrdinalIgnoreCase)
            || string.Equals(order.PaymentStatus, "REFUNDED", StringComparison.OrdinalIgnoreCase);

        foreach (var item in order.Items ?? new List<OrderItemSnapshot>())
        {
            if (string.IsNullOrWhiteSpace(item?.GameId))
            {
                continue;
            }
            if (wholeOrder || (item.Quantity > 0 && item.RefundedQuantity >= item.Quantity))
            {
                result.Add(item.GameId);
            }
        }

        if (result.Count == 0 && wholeOrder && !string.IsNullOrWhiteSpace(order.GameId))
        {
            result.Add(order.GameId);
        }
        return result;
    }

    /// <summary>
    /// Считается ли покупка игры возвращённой по всем заказам человека: да, если ни один
    /// оплаченный заказ с этой игрой не остался невозвращённым.
    /// </summary>
    public static bool IsRefunded(IEnumerable<Order>? orders, string gameId)
    {
        var bought = false;
        foreach (var order in orders ?? Array.Empty<Order>())
        {
            if (order is null || !order.IsPaid || !PurchasedGames.From(new[] { order }).Contains(gameId))
            {
                continue;
            }
            bought = true;
            if (!GameIds(order).Contains(gameId))
            {
                return false;
            }
        }
        return bought;
    }
}
