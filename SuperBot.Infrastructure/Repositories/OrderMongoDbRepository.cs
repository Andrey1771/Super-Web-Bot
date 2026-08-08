using AutoMapper;
using MongoDB.Driver;
using MongoDB.Bson;
using System.Security.Cryptography;
using System.Text;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class OrderMongoDbRepository : IOrderRepository
    {
        private readonly IMongoCollection<OrderDb> _orders;
        private readonly IMapper _mapper;

        public OrderMongoDbRepository(IMongoDatabase database, IMapper mapper)
        {
            _mapper = mapper;
            _orders = database.GetCollection<OrderDb>("Orders");
        }

        public async Task CreateOrderAsync(Order order)
        {
            if (order.Id == Guid.Empty)
            {
                order.Id = Guid.NewGuid();
            }

            var newOrder = _mapper.Map<OrderDb>(order);
            if (newOrder.Id == ObjectId.Empty)
            {
                newOrder.Id = ObjectId.GenerateNewId();
            }

            if (string.IsNullOrWhiteSpace(newOrder.OrderId))
            {
                newOrder.OrderId = order.Id.ToString();
            }

            if (newOrder.OrderGuid == Guid.Empty)
            {
                newOrder.OrderGuid = order.Id;
            }

            if (string.IsNullOrWhiteSpace(newOrder.OrderNumber))
            {
                newOrder.OrderNumber = $"TS-{DateTime.UtcNow:yyyyMMdd}-{newOrder.OrderGuid.ToString("N")[..6].ToUpperInvariant()}";
            }

            if (string.IsNullOrWhiteSpace(newOrder.UserId))
            {
                newOrder.UserId = order.UserId;
            }

            await _orders.InsertOneAsync(newOrder);
            order.Id = Guid.TryParse(newOrder.OrderId, out var createdOrderId) ? createdOrderId : order.Id;
        }

        public async Task<Order> GetOrderByIdAsync(string orderId)
        {
            var filter = BuildOrderIdentityFilter(orderId);
            var orderDb = await _orders.Find(filter).FirstOrDefaultAsync();

            if (orderDb != null)
            {
                await EnsureOrderGuidAsync(orderDb);
            }

            return _mapper.Map<Order>(orderDb);
        }

        public async Task<Order?> GetByPaymentIntentIdAsync(string paymentIntentId)
        {
            if (string.IsNullOrWhiteSpace(paymentIntentId))
            {
                return null;
            }

            var orderDb = await _orders.Find(order => order.PaymentIntentId == paymentIntentId).FirstOrDefaultAsync();
            if (orderDb == null)
            {
                return null;
            }

            await EnsureOrderGuidAsync(orderDb);
            return _mapper.Map<Order>(orderDb);
        }

        public async Task<IEnumerable<Order>> GetAllOrdersAsync()
        {
            var ordersDb = await _orders.Find(_ => true).ToListAsync();
            await EnsureOrderGuidsAsync(ordersDb);
            return _mapper.Map<IEnumerable<Order>>(ordersDb);
        }

        public async Task<bool> HasPaidOrderAsync(string userKey)
        {
            if (string.IsNullOrWhiteSpace(userKey))
            {
                return false;
            }

            // Владелец заказа пишется и в UserId, и в UserName (см. OrderFinalizationService),
            // но у заказов из разных источников заполнено может быть только одно — проверяем оба.
            var filter = Builders<OrderDb>.Filter.And(
                Builders<OrderDb>.Filter.Eq(order => order.IsPaid, true),
                Builders<OrderDb>.Filter.Or(
                    Builders<OrderDb>.Filter.Eq(order => order.UserId, userKey),
                    Builders<OrderDb>.Filter.Eq(order => order.UserName, userKey)));

            return await _orders.Find(filter).AnyAsync();
        }

        public async Task<List<Order>> GetPaidOrdersSinceAsync(DateTime sinceUtc)
        {
            // Дата продажи — PaidAt; у заказов, созданных до появления этого поля, берём OrderDate.
            var soldSince = Builders<OrderDb>.Filter.Or(
                Builders<OrderDb>.Filter.Gte(order => order.PaidAt, sinceUtc),
                Builders<OrderDb>.Filter.And(
                    Builders<OrderDb>.Filter.Eq(order => order.PaidAt, null),
                    Builders<OrderDb>.Filter.Gte(order => order.OrderDate, sinceUtc)));

            var filter = Builders<OrderDb>.Filter.And(
                Builders<OrderDb>.Filter.Eq(order => order.IsPaid, true),
                soldSince);

            var ordersDb = await _orders.Find(filter).ToListAsync();
            // EnsureOrderGuidsAsync намеренно не зовём: агрегату номера заказов не нужны,
            // а он делает дополнительную запись в базу.
            return _mapper.Map<List<Order>>(ordersDb);
        }

        public async Task<List<Order>> GetOrdersByUserAsync(string userName)
        {
            var ordersDb = await _orders.Find(order => order.UserName == userName).ToListAsync();
            await EnsureOrderGuidsAsync(ordersDb);
            return _mapper.Map<List<Order>>(ordersDb);
        }

        public async Task<List<Order>> GetUnfulfilledPaidOrdersAsync()
        {
            var filter = Builders<OrderDb>.Filter.And(
                Builders<OrderDb>.Filter.Eq(order => order.IsPaid, true),
                Builders<OrderDb>.Filter.Ne(order => order.IsFulfilled, true));
            var ordersDb = await _orders.Find(filter).ToListAsync();
            await EnsureOrderGuidsAsync(ordersDb);
            return _mapper.Map<List<Order>>(ordersDb);
        }

        public async Task<IReadOnlyDictionary<string, int>> GetOwedKeyCountByGameAsync()
        {
            // Готовы к выдаче, но не закрыты: оплачен, не выдан, НЕ под верификацией почты, оплата в PAID
            // (возвраты/споры/pending-возврат исключаем — по ним ключ не должны).
            var filter = Builders<OrderDb>.Filter.And(
                Builders<OrderDb>.Filter.Eq(order => order.IsPaid, true),
                Builders<OrderDb>.Filter.Ne(order => order.IsFulfilled, true),
                Builders<OrderDb>.Filter.Ne(order => order.RequiresDeliveryVerification, true),
                Builders<OrderDb>.Filter.Eq(order => order.PaymentStatus, "PAID"));
            var ordersDb = await _orders.Find(filter).ToListAsync();
            var orders = _mapper.Map<List<Order>>(ordersDb);

            var owed = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            foreach (var order in orders)
            {
                foreach (var item in order.Items)
                {
                    if (string.IsNullOrWhiteSpace(item.GameId))
                    {
                        continue;
                    }
                    var needed = Math.Max(1, item.Quantity);
                    var delivered = item.Delivery?.Keys.Count ?? 0;
                    var deficit = needed - delivered;
                    if (deficit > 0)
                    {
                        owed[item.GameId] = (owed.TryGetValue(item.GameId, out var current) ? current : 0) + deficit;
                    }
                }
            }
            return owed;
        }

        public async Task<IReadOnlyList<OwedKeyLine>> GetOwedKeyOrdersAsync()
        {
            var filter = Builders<OrderDb>.Filter.And(
                Builders<OrderDb>.Filter.Eq(order => order.IsPaid, true),
                Builders<OrderDb>.Filter.Ne(order => order.IsFulfilled, true),
                Builders<OrderDb>.Filter.Ne(order => order.RequiresDeliveryVerification, true),
                Builders<OrderDb>.Filter.Eq(order => order.PaymentStatus, "PAID"));
            var ordersDb = await _orders.Find(filter).ToListAsync();
            var orders = _mapper.Map<List<Order>>(ordersDb);

            var lines = new List<OwedKeyLine>();
            foreach (var order in orders)
            {
                foreach (var item in order.Items)
                {
                    if (string.IsNullOrWhiteSpace(item.GameId))
                    {
                        continue;
                    }
                    var needed = Math.Max(1, item.Quantity);
                    var remaining = needed - (item.Delivery?.Keys.Count ?? 0);
                    if (remaining > 0)
                    {
                        lines.Add(new OwedKeyLine(
                            order.OrderNumber ?? order.Id.ToString(),
                            order.UserId,
                            item.GameId,
                            remaining,
                            order.CreatedAt));
                    }
                }
            }

            // Самые старые ожидания — вперёд (дольше всех ждут).
            return lines.OrderBy(l => l.CreatedAt).ToList();
        }

        public async Task<List<Order>> GetUnverifiedGuestOrdersAsync(DateTime createdBeforeUtc)
        {
            // PAID — свежие кандидаты; REFUND_PENDING — прошлый заход не довёл возврат до конца
            // (упал Stripe/процесс) и его надо повторить. Идемпотентный ключ возврата делает повтор безопасным.
            var filter = Builders<OrderDb>.Filter.And(
                Builders<OrderDb>.Filter.Eq(order => order.RequiresDeliveryVerification, true),
                Builders<OrderDb>.Filter.Eq(order => order.IsPaid, true),
                Builders<OrderDb>.Filter.In(order => order.PaymentStatus, new[] { "PAID", "REFUND_PENDING" }),
                Builders<OrderDb>.Filter.Lt(order => order.CreatedAt, createdBeforeUtc));

            var ordersDb = await _orders.Find(filter).ToListAsync();
            await EnsureOrderGuidsAsync(ordersDb);
            return _mapper.Map<List<Order>>(ordersDb);
        }

        public async Task<bool> HasVerifiedDeliveryEmailAsync(string email)
        {
            if (string.IsNullOrWhiteSpace(email))
            {
                return false;
            }

            // Почта = UserName заказа. Совпадение регистронезависимое: гостевые почты хранятся
            // в нижнем регистре, но у залогиненных клейм может отличаться регистром.
            // Проверена = хотя бы один заказ, где подтверждение уже снято, оплачен и оплата в PAID
            // (возвраты/споры имеют иной PaymentStatus и в доверенные не попадают).
            var filter = Builders<OrderDb>.Filter.And(
                Builders<OrderDb>.Filter.Regex(order => order.UserName,
                    new BsonRegularExpression("^" + System.Text.RegularExpressions.Regex.Escape(email.Trim()) + "$", "i")),
                Builders<OrderDb>.Filter.Eq(order => order.RequiresDeliveryVerification, false),
                Builders<OrderDb>.Filter.Eq(order => order.IsPaid, true),
                Builders<OrderDb>.Filter.Eq(order => order.PaymentStatus, "PAID"));

            return await _orders.Find(filter).Limit(1).AnyAsync();
        }

        public async Task<bool> TryMarkRefundPendingAsync(string orderId)
        {
            // Атомарность критична: это «замок» против гонки с подтверждением почты.
            // Проверка условия и запись — одна операция Mongo, вдвоём сюда не пройти.
            var filter = Builders<OrderDb>.Filter.And(
                Builders<OrderDb>.Filter.Eq(order => order.OrderId, orderId),
                Builders<OrderDb>.Filter.Eq(order => order.RequiresDeliveryVerification, true),
                Builders<OrderDb>.Filter.Eq(order => order.PaymentStatus, "PAID"));

            var update = Builders<OrderDb>.Update
                .Set(order => order.PaymentStatus, "REFUND_PENDING")
                .Set(order => order.UpdatedAt, DateTime.UtcNow);

            var result = await _orders.UpdateOneAsync(filter, update);
            return result.ModifiedCount == 1;
        }

        public async Task<Order?> TryConfirmDeliveryVerificationAsync(string orderId)
        {
            // Зеркальный «замок»: подтверждение проходит, только пока заказ не занят возвратом.
            var filter = Builders<OrderDb>.Filter.And(
                Builders<OrderDb>.Filter.Eq(order => order.OrderId, orderId),
                Builders<OrderDb>.Filter.Eq(order => order.RequiresDeliveryVerification, true),
                Builders<OrderDb>.Filter.Eq(order => order.PaymentStatus, "PAID"));

            var update = Builders<OrderDb>.Update
                .Set(order => order.RequiresDeliveryVerification, false)
                .Set(order => order.UpdatedAt, DateTime.UtcNow)
                .Push(order => order.Events, new OrderEventDb
                {
                    Type = "verification",
                    Message = "Buyer confirmed their email",
                    CreatedAt = DateTime.UtcNow
                });

            var updated = await _orders.FindOneAndUpdateAsync(filter, update,
                new FindOneAndUpdateOptions<OrderDb> { ReturnDocument = ReturnDocument.After });

            if (updated == null)
            {
                return null;
            }

            await EnsureOrderGuidAsync(updated);
            return _mapper.Map<Order>(updated);
        }

        public async Task<(IReadOnlyList<Order> Items, long Total)> GetPagedByUsersAsync(
            IReadOnlyCollection<string> userNames,
            OrderQueryParameters query)
        {
            if (userNames.Count == 0)
            {
                return (Array.Empty<Order>(), 0);
            }

            var filter = Builders<OrderDb>.Filter.In(order => order.UserName, userNames);
            filter &= BuildFilter(query);

            return await FetchPagedAsync(filter, query);
        }

        public async Task<(IReadOnlyList<Order> Items, long Total)> GetPagedAsync(OrderQueryParameters query)
        {
            var filter = BuildFilter(query);
            return await FetchPagedAsync(filter, query);
        }

        public async Task UpdateOrderAsync(Order order)
        {
            if (order.Id == Guid.Empty)
            {
                order.Id = Guid.NewGuid();
            }

            var orderDb = _mapper.Map<OrderDb>(order);
            if (string.IsNullOrWhiteSpace(orderDb.OrderId))
            {
                orderDb.OrderId = order.Id.ToString();
            }

            // Доменный Order не носит в себе mongo-шный _id, поэтому после маппинга он пустой.
            // ReplaceOne с пустым _id Mongo отвергает: «immutable field '_id' was altered» (код 66),
            // из-за чего ЛЮБОЕ обновление заказа падало — в том числе сохранение выданных ключей.
            var existingId = await _orders
                .Find(o => o.OrderId == orderDb.OrderId)
                .Project(o => o.Id)
                .FirstOrDefaultAsync();

            if (existingId != default)
            {
                orderDb.Id = existingId;
            }

            await _orders.ReplaceOneAsync(o => o.OrderId == orderDb.OrderId, orderDb);
        }

        public async Task DeleteOrderAsync(string orderId)
        {
            var filter = BuildOrderIdentityFilter(orderId);
            await _orders.DeleteOneAsync(filter);
        }

        private static FilterDefinition<OrderDb> BuildStatusFilter(string status)
        {
            var normalized = status.Trim().ToUpperInvariant();
            var statusFilter = Builders<OrderDb>.Filter.Eq(order => order.Status, normalized);

            return normalized switch
            {
                "PENDING" => Builders<OrderDb>.Filter.Or(statusFilter, Builders<OrderDb>.Filter.Eq(order => order.IsPaid, false)),
                "PAID" => Builders<OrderDb>.Filter.Or(
                    statusFilter,
                    Builders<OrderDb>.Filter.And(
                        Builders<OrderDb>.Filter.Eq(order => order.IsPaid, true),
                        Builders<OrderDb>.Filter.Eq(order => order.IsFulfilled, false)
                    )),
                "PROCESSING" => Builders<OrderDb>.Filter.Or(
                    statusFilter,
                    Builders<OrderDb>.Filter.And(
                        Builders<OrderDb>.Filter.Eq(order => order.IsPaid, true),
                        Builders<OrderDb>.Filter.Eq(order => order.IsFulfilled, false)
                    )),
                "DELIVERED" => Builders<OrderDb>.Filter.Or(
                    statusFilter,
                    Builders<OrderDb>.Filter.And(
                        Builders<OrderDb>.Filter.Eq(order => order.IsPaid, true),
                        Builders<OrderDb>.Filter.Eq(order => order.IsFulfilled, true)
                    )),
                _ => statusFilter
            };
        }

        private static FilterDefinition<OrderDb> BuildPaymentStatusFilter(string status)
        {
            var normalized = status.Trim().ToUpperInvariant();
            var paymentFilter = Builders<OrderDb>.Filter.Eq(order => order.PaymentStatus, normalized);

            return normalized switch
            {
                "PAID" => Builders<OrderDb>.Filter.Or(paymentFilter, Builders<OrderDb>.Filter.Eq(order => order.IsPaid, true)),
                "UNPAID" => Builders<OrderDb>.Filter.Or(paymentFilter, Builders<OrderDb>.Filter.Eq(order => order.IsPaid, false)),
                _ => paymentFilter
            };
        }

        private static FilterDefinition<OrderDb> BuildFilter(OrderQueryParameters query)
        {
            var filter = Builders<OrderDb>.Filter.Empty;

            if (!string.IsNullOrWhiteSpace(query.Search))
            {
                var regex = new BsonRegularExpression(query.Search, "i");
                var searchFilter = Builders<OrderDb>.Filter.Or(
                    Builders<OrderDb>.Filter.Regex(order => order.GameName, regex),
                    Builders<OrderDb>.Filter.Regex(order => order.UserName, regex),
                    Builders<OrderDb>.Filter.Regex(order => order.OrderNumber, regex),
                    Builders<OrderDb>.Filter.ElemMatch(order => order.Items, Builders<OrderItemSnapshotDb>.Filter.Regex(item => item.Title, regex))
                );
                filter &= searchFilter;
            }

            if (!string.IsNullOrWhiteSpace(query.Status))
            {
                filter &= BuildStatusFilter(query.Status);
            }

            if (!string.IsNullOrWhiteSpace(query.PaymentStatus))
            {
                filter &= BuildPaymentStatusFilter(query.PaymentStatus);
            }

            if (query.DateFrom.HasValue)
            {
                filter &= Builders<OrderDb>.Filter.Gte(order => order.OrderDate, query.DateFrom.Value);
            }

            if (query.DateTo.HasValue)
            {
                filter &= Builders<OrderDb>.Filter.Lte(order => order.OrderDate, query.DateTo.Value);
            }

            return filter;
        }

        private async Task<(IReadOnlyList<Order> Items, long Total)> FetchPagedAsync(FilterDefinition<OrderDb> filter, OrderQueryParameters query)
        {
            var total = await _orders.CountDocumentsAsync(filter);

            var page = query.Page < 1 ? 1 : query.Page;
            var pageSize = query.PageSize is < 1 or > 100 ? 20 : query.PageSize;

            var sort = query.Sort?.ToLowerInvariant() switch
            {
                "createdat:asc" => Builders<OrderDb>.Sort.Ascending(order => order.OrderDate),
                "total:desc" => Builders<OrderDb>.Sort.Descending(order => order.TotalAmount),
                "total:asc" => Builders<OrderDb>.Sort.Ascending(order => order.TotalAmount),
                _ => Builders<OrderDb>.Sort.Descending(order => order.OrderDate)
            };

            var ordersDb = await _orders
                .Find(filter)
                .Sort(sort)
                .Skip((page - 1) * pageSize)
                .Limit(pageSize)
                .ToListAsync();

            await EnsureOrderGuidsAsync(ordersDb);

            return (_mapper.Map<IReadOnlyList<Order>>(ordersDb), total);
        }

        private static FilterDefinition<OrderDb> BuildOrderIdentityFilter(string orderId)
        {
            if (Guid.TryParse(orderId, out var orderGuid))
            {
                return Builders<OrderDb>.Filter.Eq(order => order.OrderId, orderGuid.ToString());
            }

            if (ObjectId.TryParse(orderId, out var objectId))
            {
                return Builders<OrderDb>.Filter.Eq(order => order.Id, objectId);
            }

            if (!string.IsNullOrWhiteSpace(orderId))
            {
                return Builders<OrderDb>.Filter.Eq(order => order.OrderNumber, orderId);
            }

            return Builders<OrderDb>.Filter.Eq(order => order.OrderId, string.Empty);
        }

        private async Task EnsureOrderGuidsAsync(List<OrderDb> orders)
        {
            foreach (var order in orders)
            {
                await EnsureOrderGuidAsync(order);
            }
        }

        private async Task EnsureOrderGuidAsync(OrderDb order)
        {
            if (Guid.TryParse(order.OrderId, out _))
            {
                return;
            }

            order.OrderId = CreateStableGuidFromObjectId(order.Id).ToString();
            if (order.OrderGuid == Guid.Empty)
            {
                order.OrderGuid = Guid.Parse(order.OrderId);
            }
            if (string.IsNullOrWhiteSpace(order.OrderNumber))
            {
                order.OrderNumber = $"TS-{order.OrderDate:yyyyMMdd}-{order.OrderGuid.ToString("N")[..6].ToUpperInvariant()}";
            }
            await _orders.UpdateOneAsync(
                o => o.Id == order.Id,
                Builders<OrderDb>.Update
                    .Set(o => o.OrderId, order.OrderId)
                    .Set(o => o.OrderGuid, order.OrderGuid)
                    .Set(o => o.OrderNumber, order.OrderNumber));
        }

        private static Guid CreateStableGuidFromObjectId(ObjectId objectId)
        {
            var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(objectId.ToString()));
            var guidBytes = new byte[16];
            Array.Copy(bytes, guidBytes, guidBytes.Length);
            return new Guid(guidBytes);
        }
    }
}
