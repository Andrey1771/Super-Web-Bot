using SuperBot.Core.Entities;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface ISteamOrderRepository
    {
        Task CreateOrderAsync(SteamOrder order);
        Task<SteamOrder> GetOrderByIdAsync(string orderId);
        Task<IEnumerable<SteamOrder>> GetAllOrdersAsync();
        Task UpdateOrderAsync(SteamOrder order);
        Task DeleteOrderAsync(string orderId);
    }
}
