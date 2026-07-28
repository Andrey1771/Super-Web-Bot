using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    /// <summary>Заказ, ждущий ключи: номер, почта покупателя, игра, сколько ключей ещё должны, когда создан.</summary>
    public sealed record OwedKeyLine(string OrderNumber, string BuyerEmail, string GameId, int Remaining, System.DateTime CreatedAt);

    public interface IOrderRepository
    {
        Task CreateOrderAsync(Order order);
        Task<Order> GetOrderByIdAsync(string orderId);
        /// <summary>Заказ по платёжному намерению — по индексу ix_orders_payment_intent_unique.</summary>
        Task<Order?> GetByPaymentIntentIdAsync(string paymentIntentId);
        Task<IEnumerable<Order>> GetAllOrdersAsync();
        Task<List<Order>> GetOrdersByUserAsync(string userName);
        /// <summary>Оплаченные, но не полностью выданные заказы — для довыдачи при пополнении пула.</summary>
        Task<List<Order>> GetUnfulfilledPaidOrdersAsync();

        /// <summary>
        /// Сколько ключей «должны» по каждой игре: оплаченные, готовые к выдаче (НЕ под верификацией почты,
        /// НЕ возвращённые), но ещё не выданные заказы — то есть клиент заплатил, а ключа не было. Ключ игры → дефицит.
        /// </summary>
        Task<IReadOnlyDictionary<string, int>> GetOwedKeyCountByGameAsync();

        /// <summary>Детально «кто ждёт ключи»: по одной строке на позицию заказа с дефицитом (для админки).</summary>
        Task<IReadOnlyList<OwedKeyLine>> GetOwedKeyOrdersAsync();

        /// <summary>Гостевые заказы с неподтверждённой почтой старше порога — кандидаты на авто-возврат.</summary>
        Task<List<Order>> GetUnverifiedGuestOrdersAsync(DateTime createdBeforeUtc);

        /// <summary>
        /// true, если у этой почты уже есть успешный заказ с завершённым подтверждением выдачи
        /// (RequiresDeliveryVerification=false, оплачен, оплата в статусе PAID — не возврат/не спор).
        /// Почта считается проверенной: повторный гостевой заказ на неё не гоняем через подтверждение.
        /// </summary>
        Task<bool> HasVerifiedDeliveryEmailAsync(string email);

        /// <summary>
        /// Атомарно занимает заказ под возврат: PAID → REFUND_PENDING, только пока почта
        /// не подтверждена. false = проиграли гонку (покупатель успел подтвердить) — возврат отменяется.
        /// </summary>
        Task<bool> TryMarkRefundPendingAsync(string orderId);

        /// <summary>
        /// Атомарно фиксирует подтверждение почты (снимает RequiresDeliveryVerification), только
        /// пока заказ PAID. null = проиграли гонку (авто-возврат успел занять заказ) — ключи не выдавать.
        /// </summary>
        Task<Order?> TryConfirmDeliveryVerificationAsync(string orderId);
        Task<(IReadOnlyList<Order> Items, long Total)> GetPagedByUsersAsync(IReadOnlyCollection<string> userNames, OrderQueryParameters query);
        Task<(IReadOnlyList<Order> Items, long Total)> GetPagedAsync(OrderQueryParameters query);
        Task UpdateOrderAsync(Order order);
        Task DeleteOrderAsync(string orderId);
    }
}
