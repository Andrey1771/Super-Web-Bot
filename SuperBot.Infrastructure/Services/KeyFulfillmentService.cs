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
        private readonly IGameDetailsRepository _gameDetailsRepository;
        private readonly IBotEventPublisher _botEventPublisher;
        private readonly ILogger<KeyFulfillmentService> _logger;
        private readonly IReadOnlyList<IOrderFulfillmentObserver> _fulfillmentObservers;

        public KeyFulfillmentService(
            IGameKeyRepository gameKeyRepository,
            IOrderRepository orderRepository,
            IGameDetailsRepository gameDetailsRepository,
            IBotEventPublisher botEventPublisher,
            ILogger<KeyFulfillmentService> logger,
            IEnumerable<IOrderFulfillmentObserver> fulfillmentObservers)
        {
            _fulfillmentObservers = fulfillmentObservers.ToList();
            _gameKeyRepository = gameKeyRepository;
            _orderRepository = orderRepository;
            _gameDetailsRepository = gameDetailsRepository;
            _botEventPublisher = botEventPublisher;
            _logger = logger;
        }

        public async Task<GameKey> DispenseAsync(string gameId, string userId, string keyType = null, string issuedBy = null, string editionCode = null, string buyerCountry = null, string orderId = null, string offerKey = null)
        {
            if (string.IsNullOrWhiteSpace(gameId) || string.IsNullOrWhiteSpace(userId))
            {
                return null;
            }

            // Выдаём ключ из пула инвентаря. Пул пуст → нет в наличии (null).
            return await _gameKeyRepository.TryDispensePoolKeyAsync(gameId, userId, issuedBy, editionCode, buyerCountry, orderId, offerKey);
        }

        public async Task<IReadOnlyList<DeliveredKeyNotification>> FulfillOrderAsync(Order order, string issuedBy = null)
        {
            if (order == null || string.IsNullOrWhiteSpace(order.UserId))
            {
                return Array.Empty<DeliveredKeyNotification>();
            }

            // Гейт гостевой покупки ЖИВЁТ ЗДЕСЬ, в самой выдаче: какой бы путь ни привёл
            // (финализация, бэкфилл при пополнении пула, легаси-контроллер) — пока почта
            // не подтверждена, ключи не выдаются. Снимает флаг только verify-delivery.
            if (order.RequiresDeliveryVerification)
            {
                _logger.LogInformation("Order {OrderId}: key delivery held — buyer email not verified yet.", order.Id);
                return Array.Empty<DeliveredKeyNotification>();
            }

            // Возвращённый заказ ключей не получает: деньги уже у покупателя. Раньше полностью возвращённый, но
            // не выданный заказ оставался IsPaid и добирался со склада — покупатель получал и возврат, и ключ.
            if (OrderRefunds.Fraction(order) >= 1m)
            {
                _logger.LogInformation("Order {OrderId}: key delivery skipped — the order is refunded.", order.Id);
                return Array.Empty<DeliveredKeyNotification>();
            }

            var wasAwaiting = string.Equals(order.Status, OrderStatusAwaitingKeys, StringComparison.OrdinalIgnoreCase);
            var wasFulfilled = order.IsFulfilled;

            var newlyDelivered = await DispenseOutstandingAsync(order, issuedBy);
            RecomputeOrderStatus(order);
            order.UpdatedAt = DateTime.UtcNow;

            await _orderRepository.UpdateOrderAsync(order);
            await NotifyAsync(order, newlyDelivered);

            // Заказ только что выдан целиком (сразу или добором со склада) — сообщаем тем, кому
            // это нужно, например кэшбэку. Их ошибки выдачу не отменяют: ключи уже у покупателя.
            if (order.IsFulfilled && !wasFulfilled)
            {
                foreach (var observer in _fulfillmentObservers)
                {
                    try
                    {
                        await observer.OnOrderDeliveredAsync(order);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Fulfillment observer {Observer} failed for order {OrderId}", observer.GetType().Name, order.Id);
                    }
                }
            }

            // Клиент заплатил, а ключа нет — об этом надо знать сейчас, а не когда кто-то откроет
            // вкладку Game keys. Шлём один раз, при переходе в ожидание; повторные проходы
            // (бэкфилл, ручная попытка выдачи) молчат.
            if (!order.IsFulfilled && !wasAwaiting)
            {
                await NotifyStockShortageAsync(order);
            }

            return newlyDelivered;
        }

        public async Task<IReadOnlyList<OrderKeysDelivered>> BackfillGameAsync(string gameId)
        {
            if (string.IsNullOrWhiteSpace(gameId))
            {
                return Array.Empty<OrderKeysDelivered>();
            }

            // Только оплаченные и ещё не закрытые заказы, где есть эта игра.
            // Заказы с неподтверждённой почтой FulfillOrderAsync пропустит сам (гейт внутри).
            var pending = await _orderRepository.GetUnfulfilledPaidOrdersAsync();
            var delivered = new List<OrderKeysDelivered>();

            foreach (var order in pending)
            {
                if (!OrderContainsGame(order, gameId))
                {
                    continue;
                }

                var keys = await FulfillOrderAsync(order);
                if (keys.Count > 0)
                {
                    delivered.Add(new OrderKeysDelivered(order, keys));
                }
            }

            if (delivered.Count > 0)
            {
                _logger.LogInformation("Backfill for game {GameId}: {Affected} orders received keys.", gameId, delivered.Count);
            }

            return delivered;
        }

        /// <summary>
        /// Довыдаёт ключи по каждой позиции до нужного количества, пишет их в снапшот доставки (masked)
        /// и возвращает реально выданные в этом вызове ключи (для уведомления).
        /// </summary>
        private async Task<List<DeliveredKeyNotification>> DispenseOutstandingAsync(Order order, string issuedBy = null)
        {
            var items = NormalizeItems(order);
            var newlyDelivered = new List<DeliveredKeyNotification>();

            foreach (var item in items)
            {
                if (string.IsNullOrWhiteSpace(item.GameId))
                {
                    continue;
                }

                // Столько ключей позиция ещё должна получить: возвращённые штуки (возврат по позиции) не в счёт.
                var needed = OutstandingKeys(item);
                item.Delivery ??= new DeliverySnapshot { DeliveryType = "Key" };
                var alreadyDelivered = item.Delivery.Keys.Count;

                for (var i = alreadyDelivered; i < needed; i++)
                {
                    // Ключ — того издания, что куплено; у позиции без издания — базовый.
                    // …и того региона, где покупатель сможет его активировать; страна — из заказа (на момент оплаты).
                    // Если покупатель выбрал вариант — ключ строго из его партий: он заплатил
                    // именно за эту область активации, и подмена варианта была бы обманом
                    // (глобальный дороже, чужой региональный у него просто не заработает).
                    var key = await DispenseAsync(item.GameId, order.UserId, null, issuedBy, item.EditionCode, order.BuyerCountry, order.Id.ToString(), item.OfferKey)
                        ?? await DispenseDefaultEditionFallbackAsync(item, order, issuedBy);
                    if (key == null || string.IsNullOrWhiteSpace(key.Key))
                    {
                        break; // пул пуст — оставляем позицию ждущей
                    }

                    item.Delivery.Keys.Add(new DeliveredKey { KeyMasked = MaskKey(key.Key), DeliveredAt = DateTime.UtcNow });
                    item.Delivery.DeliveredAt = DateTime.UtcNow;
                    newlyDelivered.Add(new DeliveredKeyNotification(ResolveTitle(item, order), key.Key, key.KeyType, item.ProductType, item.GameId, item.EditionCode));
                }
            }

            return newlyDelivered;
        }

        /// <summary>
        /// Второй заход для издания по умолчанию. Его ключи лежат в пуле двумя способами: без кода издания (так
        /// заливались все ключи до появления изданий и так админка заливает ключи базового издания) и с его кодом
        /// (загрузка через API или издание, ставшее базовым уже после заливки). Наличие на витрине считает оба
        /// запаса вместе, поэтому и выдача обязана видеть оба: строка с кодом добирает ключи без кода, строка без
        /// кода (старые заказы) — ключи с кодом издания по умолчанию. Только при промахе основной попытки: карточка
        /// товара читается не на каждом ключе.
        /// </summary>
        private async Task<GameKey> DispenseDefaultEditionFallbackAsync(OrderItemSnapshot item, Order order, string issuedBy)
        {
            GameDetails details;
            try
            {
                details = await _gameDetailsRepository.GetByGameIdAsync(item.GameId);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Order {OrderId}: could not read the product card for the default-edition key fallback.", order.Id);
                return null;
            }

            var fallback = GameEditions.DefaultOf(details?.Editions);
            if (fallback is null)
            {
                return null;
            }

            string alternativeCode;
            if (string.IsNullOrWhiteSpace(item.EditionCode))
            {
                alternativeCode = fallback.Code;
            }
            else if (string.Equals(item.EditionCode.Trim(), fallback.Code, StringComparison.OrdinalIgnoreCase))
            {
                alternativeCode = null; // ключи без кода
            }
            else
            {
                return null; // надстроечное издание — только его собственные ключи
            }

            return await DispenseAsync(item.GameId, order.UserId, null, issuedBy, alternativeCode, order.BuyerCountry, order.Id.ToString(), item.OfferKey);
        }

        /// <summary>
        /// Сколько ключей позиция должна получить всего: купленное минус возвращённое по позиции. Возвращённая
        /// строка ключей не ждёт — иначе добор со склада выдавал бы ключ за товар, деньги за который уже вернули.
        /// </summary>
        private static int OutstandingKeys(OrderItemSnapshot item) =>
            Math.Max(0, Math.Max(1, item.Quantity) - item.RefundedQuantity);

        private void RecomputeOrderStatus(Order order)
        {
            var items = NormalizeItems(order);
            var totalNeeded = items.Sum(OutstandingKeys);
            var totalDelivered = items.Sum(item => item.Delivery?.Keys.Count ?? 0);
            if (totalNeeded == 0)
            {
                // Все строки возвращены — статус задаёт возврат, а не выдача.
                return;
            }

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

        /// <summary>
        /// Алерт специалистам: оплаченный заказ ждёт ключей. Идёт тем же каналом, что эскалация
        /// чата (событие в outbox → бот шлёт в Telegram), поэтому доходит туда, где сотрудники
        /// уже читают срочное. Сбой публикации выдачу не ломает — это уведомление, не транзакция.
        /// </summary>
        private async Task NotifyStockShortageAsync(Order order)
        {
            try
            {
                var missing = NormalizeItems(order)
                    .Where(item => (item.Delivery?.Keys.Count ?? 0) < Math.Max(1, item.Quantity))
                    .Select(item => $"{ResolveTitle(item, order)} × {Math.Max(1, item.Quantity) - (item.Delivery?.Keys.Count ?? 0)}")
                    .ToList();

                var text =
                    "🔑 Paid order is waiting for keys\n\n" +
                    $"Order: {order.OrderNumber ?? order.Id.ToString()}\n" +
                    $"Customer: {order.UserId}\n" +
                    $"Missing: {string.Join("; ", missing)}\n\n" +
                    "Add keys in Admin → Game keys; the order is delivered automatically once the pool is refilled.";

                await _botEventPublisher.PublishAsync(BotEventTypes.SupportEscalation, new SupportEscalationEvent(text));
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Stock shortage alert failed for order {OrderId}.", order.Id);
            }
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

        /// <summary>
        /// Название позиции для человека: издание уже внутри Title, регион добавляем здесь.
        ///
        /// Регион в названии обязателен именно потому, что ключ региональный: покупатель должен
        /// прочитать в письме, где он активируется, а сотрудник — какую партию пополнять.
        /// </summary>
        private static string ResolveTitle(OrderItemSnapshot item, Order order)
        {
            var title = !string.IsNullOrWhiteSpace(item.Title) ? item.Title
                : string.IsNullOrWhiteSpace(order.GameName) ? "Game purchase" : order.GameName;

            return string.IsNullOrWhiteSpace(item.OfferTitle) ? title : $"{title} ({item.OfferTitle})";
        }

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
