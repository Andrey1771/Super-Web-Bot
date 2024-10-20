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
    }
}
