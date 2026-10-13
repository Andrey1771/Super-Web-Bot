using SuperBot.Core.Entities;

namespace SuperBot.Core.Services;

/// <summary>
/// Какие игры человек действительно купил — по его заказам.
///
/// Отдельное место, потому что правило нужно в трёх точках сразу (форма отзыва на странице
/// игры, приём отзыва на сервере, кнопка в заказах кабинета), и разъехавшиеся копии этого
/// правила уже стоили нам ошибки: везде стояло <c>order.GameId == gameId</c>, а
/// <see cref="Order.GameId"/> заполняется ПЕРВОЙ позицией заказа
/// (OrderFinalizationService: <c>GameId = firstItem?.GameId</c>). В заказе из трёх игр
/// покупатель мог оставить отзыв только на первую, а на остальные получал 403 —
/// и не понимал, почему форма не появляется.
///
/// Здесь смотрим на позиции заказа, а на устаревшее поле откатываемся только тогда, когда
/// позиций нет вовсе: у заказов, оформленных до появления снапшотов, другого источника нет.
/// </summary>
public static class PurchasedGames
{
    /// <summary>
    /// Идентификаторы игр из оплаченных заказов. Возврат покупку не отменяет: человек играл
    /// и имеет что сказать — это отзыв на игру, а не подтверждение лояльности.
    /// </summary>
    public static IReadOnlySet<string> From(IEnumerable<Order>? orders)
    {
        var result = new HashSet<string>(StringComparer.Ordinal);
        if (orders is null)
        {
            return result;
        }

        foreach (var order in orders)
        {
            if (order is null || !order.IsPaid)
            {
                continue;
            }

            var items = order.Items;
            if (items is { Count: > 0 })
            {
                foreach (var item in items)
                {
                    if (!string.IsNullOrWhiteSpace(item?.GameId))
                    {
                        result.Add(item!.GameId!);
                    }
                }
                continue;
            }

            if (!string.IsNullOrWhiteSpace(order.GameId))
            {
                result.Add(order.GameId);
            }
        }

        return result;
    }

    /// <summary>Куплена ли конкретная игра. Пустой <paramref name="gameId"/> — всегда нет.</summary>
    public static bool Contains(IEnumerable<Order>? orders, string? gameId) =>
        !string.IsNullOrWhiteSpace(gameId) && From(orders).Contains(gameId);
}
