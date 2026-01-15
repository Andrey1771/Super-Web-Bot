using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.APIs
{
    public interface IOrderApiClient
    {
        public Task<IEnumerable<Order>> GetAllOrdersAsync();
        public Task<IEnumerable<Order>> GetOrdersByUserNameAsync(string userName);
        public Task<Order> GetOrderByIdAsync(string id);
        public Task CreateOrderAsync(Order newOrder);
        public Task UpdateOrderAsync(string id, Order updatedOrder);
        public Task DeleteOrderAsync(string id);
    }
}
