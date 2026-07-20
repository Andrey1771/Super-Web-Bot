using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces
{
    /// <summary>
    /// Выдача ключей: берём ключ из пула инвентаря; если пул пуст — ключ не выдаётся (нет в наличии).
    /// </summary>
    public interface IKeyFulfillmentService
    {
        Task<GameKey> DispenseAsync(string gameId, string userId, string keyType = null);

        /// <summary>
        /// Выдаёт ключи по позициям оплаченного заказа, проставляет честный статус
        /// (DELIVERED / ожидание ключей), сохраняет заказ и уведомляет пользователя.
        /// </summary>
        Task FulfillOrderAsync(Order order);

        /// <summary>
        /// Довыдача после пополнения пула: находит оплаченные заказы с этой игрой,
        /// которым не хватило ключей, и допоставляет их. Возвращает число затронутых заказов. Идемпотентно.
        /// </summary>
        Task<int> BackfillGameAsync(string gameId);
    }
}
