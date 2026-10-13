using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces
{
    /// <summary>
    /// Выдача ключей: берём ключ из пула инвентаря; если пул пуст — ключ не выдаётся (нет в наличии).
    /// </summary>
    public interface IKeyFulfillmentService
    {
        /// <param name="issuedBy">Почта сотрудника при ручной выдаче; null — автоматическая выдача при оплате.</param>
        /// <param name="offerKey">
        /// Региональный вариант, за который заплатил покупатель: ключ берётся строго из партий с
        /// этой областью активации. null — вариант не выбирался, годится любой подходящий ключ.
        /// </param>
        Task<GameKey> DispenseAsync(string gameId, string userId, string keyType = null, string issuedBy = null, string editionCode = null, string buyerCountry = null, string orderId = null, string offerKey = null);

        /// <summary>
        /// Выдаёт ключи по позициям оплаченного заказа, проставляет честный статус
        /// (DELIVERED / ожидание ключей), сохраняет заказ и уведомляет пользователя.
        /// Возвращает РЕАЛЬНО выданные в этом вызове ключи — вызывающий решает,
        /// как их доставить (email, страница), не залезая в маскированный снапшот.
        /// </summary>
        Task<IReadOnlyList<DeliveredKeyNotification>> FulfillOrderAsync(Order order, string issuedBy = null);

        /// <summary>
        /// Довыдача после пополнения пула: находит оплаченные заказы с этой игрой,
        /// которым не хватило ключей, и допоставляет их. Идемпотентно.
        /// Возвращает, КОМУ и ЧТО довыдано — вызывающий обязан доставить это покупателю
        /// (письмо), иначе ключи выдаются молча и гость о них никогда не узнает.
        /// </summary>
        Task<IReadOnlyList<OrderKeysDelivered>> BackfillGameAsync(string gameId);
    }

    /// <summary>Результат довыдачи по одному заказу: заказ + реально выданные сейчас ключи.</summary>
    public record OrderKeysDelivered(Order Order, IReadOnlyList<DeliveredKeyNotification> Keys);
}
