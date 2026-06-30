using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Services
{
    public class KeyFulfillmentService : IKeyFulfillmentService
    {
        private readonly IGameKeyRepository _gameKeyRepository;

        public KeyFulfillmentService(IGameKeyRepository gameKeyRepository)
        {
            _gameKeyRepository = gameKeyRepository;
        }

        public async Task<GameKey> DispenseAsync(string gameId, string userId, string keyType = null)
        {
            if (string.IsNullOrWhiteSpace(gameId) || string.IsNullOrWhiteSpace(userId))
            {
                return null;
            }

            // Выдаём ключ из пула инвентаря. Пул пуст → нет в наличии (null).
            return await _gameKeyRepository.TryDispensePoolKeyAsync(gameId, userId);
        }

        public async Task FulfillOrderAsync(Order order)
        {
            if (order == null || string.IsNullOrWhiteSpace(order.UserId))
            {
                return;
            }

            var gameIds = (order.Items ?? new List<OrderItemSnapshot>())
                .Where(i => !string.IsNullOrWhiteSpace(i.GameId))
                .Select(i => i.GameId)
                .ToList();

            if (gameIds.Count == 0 && !string.IsNullOrWhiteSpace(order.GameId))
            {
                gameIds.Add(order.GameId); // легаси: одиночная игра в заказе
            }

            foreach (var gameId in gameIds)
            {
                await DispenseAsync(gameId, order.UserId);
            }
        }
    }
}
