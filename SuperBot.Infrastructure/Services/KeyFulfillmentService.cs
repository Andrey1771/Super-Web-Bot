using Microsoft.Extensions.Logging;
using SuperBot.Core.Entities;
using SuperBot.Core.Events;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.Infrastructure.Services
{
    public class KeyFulfillmentService : IKeyFulfillmentService
    {
        // Статусы выдачи заказа (order.FulfillmentStatus).
        public const string StatusDelivered = "DELIVERED";
        public const string StatusPartial = "PARTIAL";
        public const string StatusPendingKeys = "PENDING_KEYS";
        // Общий статус заказа для UI: пока ключи выданы не полностью — ждём склад.
        private const string OrderStatusAwaitingKeys = "AWAITING_KEYS";
        private const string OrderStatusDelivered = "DELIVERED";

        private readonly IGameKeyRepository _gameKeyRepository;
        private readonly IOrderRepository _orderRepository;
        private readonly IBotEventPublisher _botEventPublisher;
        private readonly ILogger<KeyFulfillmentService> _logger;

        public KeyFulfillmentService(
            IGameKeyRepository gameKeyRepository,
            IOrderRepository orderRepository,
            IBotEventPublisher botEventPublisher,
            ILogger<KeyFulfillmentService> logger)
        {
            _gameKeyRepository = gameKeyRepository;
            _orderRepository = orderRepository;
            _botEventPublisher = botEventPublisher;
            _logger = logger;
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

            var newlyDelivered = await DispenseOutstandingAsync(order);
            RecomputeOrderStatus(order);
            order.UpdatedAt = DateTime.UtcNow;

            await _orderRepository.UpdateOrderAsync(order);
            await NotifyAsync(order, newlyDelivered);
        }

        public async Task<int> BackfillGameAsync(string gameId)
        {
            if (string.IsNullOrWhiteSpace(gameId))
            {
                return 0;
            }

            // Только оплаченные и ещё не закрытые заказы, где есть эта игра.
            var pending = await _orderRepository.GetUnfulfilledPaidOrdersAsync();
            var affected = 0;

            foreach (var order in pending)
            {
                if (!OrderContainsGame(order, gameId))
                {
                    continue;
                }

                var before = CountDeliveredKeys(order);
                await FulfillOrderAsync(order);
                if (CountDeliveredKeys(order) > before)
                {
                    affected++;
                }
            }

            if (affected > 0)
            {
                _logger.LogInformation("Backfill for game {GameId}: {Affected} orders received keys.", gameId, affected);
            }

            return affected;
        }

        /// <summary>
        /// Довыдаёт ключи по каждой позиции до нужного количества, пишет их в снапшот доставки (masked)
        /// и возвращает реально выданные в этом вызове ключи (для уведомления).
        /// </summary>
        private async Task<List<DeliveredKeyNotification>> DispenseOutstandingAsync(Order order)
        {
            var items = NormalizeItems(order);
            var newlyDelivered = new List<DeliveredKeyNotification>();

            foreach (var item in items)
            {
                if (string.IsNullOrWhiteSpace(item.GameId))
                {
                    continue;
                }

                var needed = Math.Max(1, item.Quantity > 0 ? item.Quantity : item.Qty);
                item.Delivery ??= new DeliverySnapshot { DeliveryType = "Key" };
                var alreadyDelivered = item.Delivery.Keys.Count;

                for (var i = alreadyDelivered; i < needed; i++)
                {
                    var key = await DispenseAsync(item.GameId, order.UserId);
                    if (key == null || string.IsNullOrWhiteSpace(key.Key))
                    {
                        break; // пул пуст — оставляем позицию ждущей
                    }

                    item.Delivery.Keys.Add(new DeliveredKey { KeyMasked = MaskKey(key.Key), DeliveredAt = DateTime.UtcNow });
                    item.Delivery.DeliveredAt = DateTime.UtcNow;
                    newlyDelivered.Add(new DeliveredKeyNotification(ResolveTitle(item, order), key.Key));
                }
            }

            return newlyDelivered;
        }

        private void RecomputeOrderStatus(Order order)
        {
            var items = NormalizeItems(order);
            var totalNeeded = items.Sum(item => Math.Max(1, item.Quantity > 0 ? item.Quantity : item.Qty));
            var totalDelivered = items.Sum(item => item.Delivery?.Keys.Count ?? 0);

            string fulfillment;
            if (totalDelivered >= totalNeeded && totalNeeded > 0)
            {
                fulfillment = StatusDelivered;
            }
            else if (totalDelivered > 0)
            {
                fulfillment = StatusPartial;
            }
            else
            {
                fulfillment = StatusPendingKeys;
            }

            order.FulfillmentStatus = fulfillment;
            order.IsFulfilled = fulfillment == StatusDelivered;
            order.Status = order.IsFulfilled ? OrderStatusDelivered : OrderStatusAwaitingKeys;

            var eventMessage = fulfillment switch
            {
                StatusDelivered => "All keys delivered",
                StatusPartial => "Some keys delivered, awaiting stock for the rest",
                _ => "Awaiting keys in stock"
            };
            order.Events ??= new List<OrderEvent>();
            order.Events.Add(new OrderEvent { Type = "fulfillment", Message = eventMessage, CreatedAt = DateTime.UtcNow });
        }

        private async Task NotifyAsync(Order order, List<DeliveredKeyNotification> newlyDelivered)
        {
            if (newlyDelivered.Count == 0)
            {
                return;
            }

            // Событие в outbox — доставку в Telegram сделает бот-сервис. Сайт с Telegram не общается.
            var aliases = new[] { order.UserId, order.UserName }
                .Where(alias => !string.IsNullOrWhiteSpace(alias))
                .ToList();
            await _botEventPublisher.PublishAsync(BotEventTypes.KeysDelivered, new KeysDeliveredEvent(aliases, newlyDelivered));
        }

        private static List<OrderItemSnapshot> NormalizeItems(Order order)
        {
            var items = order.Items ?? new List<OrderItemSnapshot>();
            if (items.Count == 0 && !string.IsNullOrWhiteSpace(order.GameId))
            {
                // Легаси-заказ без позиций — синтезируем одну из полей заказа.
                items = new List<OrderItemSnapshot>
                {
                    new()
                    {
                        GameId = order.GameId,
                        Title = string.IsNullOrWhiteSpace(order.GameName) ? "Game purchase" : order.GameName,
                        Quantity = 1
                    }
                };
                order.Items = items;
            }
            return items;
        }

        private static bool OrderContainsGame(Order order, string gameId) =>
            (order.Items ?? new List<OrderItemSnapshot>()).Any(item => string.Equals(item.GameId, gameId, StringComparison.OrdinalIgnoreCase))
            || string.Equals(order.GameId, gameId, StringComparison.OrdinalIgnoreCase);

        private static int CountDeliveredKeys(Order order) =>
            (order.Items ?? new List<OrderItemSnapshot>()).Sum(item => item.Delivery?.Keys.Count ?? 0);

        private static string ResolveTitle(OrderItemSnapshot item, Order order) =>
            !string.IsNullOrWhiteSpace(item.Title) ? item.Title
            : !string.IsNullOrWhiteSpace(item.TitleSnapshot) ? item.TitleSnapshot
            : string.IsNullOrWhiteSpace(order.GameName) ? "Game purchase" : order.GameName;

        /// <summary>Маскирует ключ для истории заказа: видны только последние 4 символа.</summary>
        private static string MaskKey(string key)
        {
            if (string.IsNullOrWhiteSpace(key))
            {
                return string.Empty;
            }

            var trimmed = key.Trim();
            if (trimmed.Length <= 4)
            {
                return new string('•', trimmed.Length);
            }

            return new string('•', trimmed.Length - 4) + trimmed[^4..];
        }
    }
}
