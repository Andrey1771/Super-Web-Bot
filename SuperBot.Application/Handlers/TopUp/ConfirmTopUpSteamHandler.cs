using MediatR;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Application.Commands.TopUp;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Services;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Telegram.Bot;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;

namespace SuperBot.Application.Handlers.TopUp
{
    internal class ConfirmTopUpSteamHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IAdminSettingsProvider _adminSettingsProvider) : IRequestHandler<ConfirmTopUpSteamCommand, Message>
    {
        private readonly long adminChatId = _adminSettingsProvider.AdminChatId;

        public async Task<Message> Handle(ConfirmTopUpSteamCommand request, CancellationToken cancellationToken)
        {
            using var serviceScope = _serviceProvider.GetRequiredService<IServiceScopeFactory>().CreateScope();
            var orderRepository = serviceScope.ServiceProvider.GetService(typeof(ISteamOrderRepository)) as ISteamOrderRepository;
            
            var order = await orderRepository.GetOrderByIdAsync(request.OrderId);

            if (order == null)
            {
                throw new Exception("Id заказа не был найден в БД");
            }

            order.IsPaid = true;

            await orderRepository.UpdateOrderAsync(order);

            return await NotifyAdminAsync(order.Username, order.SteamLogin, order.Amount, order.TotalAmount);
        }

        private Task<Message> NotifyAdminAsync(string username, string steamLogin, decimal amount, decimal totalAmount)
        {
            string adminMessage = string.Format(_translationsService.Translation.NotifyTopUpSteam, username, steamLogin, amount, totalAmount, "Да");
            return _botClient.SendTextMessageAsync(adminChatId, adminMessage, parseMode: ParseMode.Html);
        }
    }
}
