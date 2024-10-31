using AutoMapper;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    internal class SteamOrderMongoDbRepository
    {
        private readonly IMongoCollection<SteamOrderDb> _orders;
        private readonly IMapper _mapper;

        public SteamOrderMongoDbRepository(IMongoDatabase database, IMapper mapper)
        {
            _mapper = mapper;
            _orders = database.GetCollection<SteamOrderDb>("SteamOrders");
        }

        public async Task CreateOrderAsync(SteamOrder order)
        {
            var newOrder = _mapper.Map<SteamOrderDb>(order);
            await _orders.InsertOneAsync(newOrder);
        }

        public async Task<SteamOrder> GetOrderByIdAsync(string orderId)
        {
            var orderDb = await _orders.Find(o => o.Id == orderId).FirstOrDefaultAsync();
            return _mapper.Map<SteamOrder>(orderDb);
        }

        public async Task<IEnumerable<SteamOrder>> GetAllOrdersAsync()
        {
            var ordersDb = await _orders.Find(_ => true).ToListAsync();
            return _mapper.Map<IEnumerable<SteamOrder>>(ordersDb);
        }

        public async Task UpdateOrderAsync(SteamOrder order)
        {
            var orderDb = _mapper.Map<SteamOrderDb>(order);
            await _orders.ReplaceOneAsync(o => o.Id == orderDb.Id, orderDb);
        }

        public async Task DeleteOrderAsync(string orderId)
        {
            await _orders.DeleteOneAsync(o => o.Id == orderId);
        }
    }
}
