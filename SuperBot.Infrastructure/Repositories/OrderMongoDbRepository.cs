using AutoMapper;
using MongoDB.Driver;
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

        public async Task UpdateOrderAsync(Order order)
        {
            var orderDb = _mapper.Map<OrderDb>(order);
            await _orders.ReplaceOneAsync(o => o.Id == orderDb.Id, orderDb);
        }

        public async Task DeleteOrderAsync(string orderId)
        {
            await _orders.DeleteOneAsync(o => o.Id == orderId);
        }
    }
}
