using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces
{
    /// <summary>
    /// Выдача ключей: берём ключ из пула инвентаря; если пул пуст — ключ не выдаётся (нет в наличии).
    /// </summary>
    public interface IKeyFulfillmentService
    {
        Task<GameKey> DispenseAsync(string gameId, string userId, string keyType = null);
        Task FulfillOrderAsync(Order order);
    }
}
