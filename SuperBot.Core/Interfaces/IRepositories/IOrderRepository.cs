using SuperBot.Core.Entities;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IOrderRepository
    {
        Task CreateOrderAsync(Order order);
    }
}
