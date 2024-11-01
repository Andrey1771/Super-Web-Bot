using MediatR;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Application.Commands;
using SuperBot.Core.Interfaces.IRepositories;
using System;
using Telegram.Bot.Types;

namespace SuperBot.Application.Handlers
{
    public class ClearOldOrderRecordsHandler(IServiceProvider _serviceProvider) : IRequestHandler<ClearOldOrderRecordsCommand>
    {
        public async Task Handle(ClearOldOrderRecordsCommand request, CancellationToken cancellationToken)
        {
            using var serviceScope = _serviceProvider.GetRequiredService<IServiceScopeFactory>().CreateScope();
            var steamOrderRepository = serviceScope.ServiceProvider.GetService(typeof(ISteamOrderRepository)) as ISteamOrderRepository;

            var orders = await steamOrderRepository.GetAllOrdersAsync();
            // Очищаем все заказы, которые хранятся более 30 дней (Банк обрабатывает платеж в течении 5 дней // TODO Может вынести в админку
            var oldOrderIds = orders.Where(order => (DateTime.UtcNow - order.OrderCreationDate).TotalDays > 30)
                                    .Select(order => order.Id).ToList();
            
            oldOrderIds.ForEach(async orderId =>
            {
                await steamOrderRepository.DeleteOrderAsync(orderId);
            });
        }
    }
}
