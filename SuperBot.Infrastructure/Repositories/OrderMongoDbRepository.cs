using AutoMapper;
using MongoDB.Driver;
using MongoDB.Bson;
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
            var newOrder = _mapper.Map<OrderDb>(order);
            await _orders.InsertOneAsync(newOrder);
        }

        public async Task<Order> GetOrderByIdAsync(string orderId)
        {
            var orderDb = await _orders.Find(o => o.Id == orderId).FirstOrDefaultAsync();
            return _mapper.Map<Order>(orderDb);
        }

        public async Task<IEnumerable<Order>> GetAllOrdersAsync()
        {
            var ordersDb = await _orders.Find(_ => true).ToListAsync();
            return _mapper.Map<IEnumerable<Order>>(ordersDb);
        }

        public async Task<List<Order>> GetOrdersByUserAsync(string userName)
        {
            var ordersDb = await _orders.Find(order => order.UserName == userName).ToListAsync();
            return _mapper.Map<List<Order>>(ordersDb);
        }

        public async Task<(IReadOnlyList<Order> Items, long Total)> GetPagedAsync(OrderQueryParameters query)
        {
            var filter = Builders<OrderDb>.Filter.Empty;

            if (!string.IsNullOrWhiteSpace(query.Search))
            {
                var regex = new BsonRegularExpression(query.Search, "i");
                var searchFilter = Builders<OrderDb>.Filter.Or(
                    Builders<OrderDb>.Filter.Regex(order => order.GameName, regex),
                    Builders<OrderDb>.Filter.Regex(order => order.UserName, regex),
                    Builders<OrderDb>.Filter.Regex(order => order.Id, regex)
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

            var total = await _orders.CountDocumentsAsync(filter);

            var page = query.Page < 1 ? 1 : query.Page;
            var pageSize = query.PageSize is < 1 or > 100 ? 20 : query.PageSize;

            var sort = query.Sort?.ToLowerInvariant() == "createdat:asc"
                ? Builders<OrderDb>.Sort.Ascending(order => order.OrderDate)
                : Builders<OrderDb>.Sort.Descending(order => order.OrderDate);

            var ordersDb = await _orders
                .Find(filter)
                .Sort(sort)
                .Skip((page - 1) * pageSize)
                .Limit(pageSize)
                .ToListAsync();

            return (_mapper.Map<IReadOnlyList<Order>>(ordersDb), total);
        }

        public async Task UpdateOrderAsync(Order order)
        {
            var orderDb = _mapper.Map<OrderDb>(order);
            await _orders.ReplaceOneAsync(o => o.Id == orderDb.Id, orderDb);
        }

        public async Task DeleteOrderAsync(string orderId)
        {
            await _orders.DeleteOneAsync(o => o.Id == orderId);
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
    }
}
