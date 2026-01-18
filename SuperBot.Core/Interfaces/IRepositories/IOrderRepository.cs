using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IOrderRepository
    {
        Task CreateOrderAsync(Order order);
        Task<Order> GetOrderByIdAsync(string orderId);
        Task<IEnumerable<Order>> GetAllOrdersAsync();
        Task<List<Order>> GetOrdersByUserAsync(string userName);
        Task UpdateOrderAsync(Order order);
        Task DeleteOrderAsync(string orderId);
    }
}
