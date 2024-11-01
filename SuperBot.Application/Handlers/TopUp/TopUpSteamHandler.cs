using MediatR;
using SuperBot.Core.Interfaces;
using Telegram.Bot.Types;
using Telegram.Bot;
using Telegram.Bot.Types.Enums;
using SuperBot.Application.Handlers.Base;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Application.Commands.TopUp;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IBotStateService;
using SuperBot.WebApi.Services;

namespace SuperBot.Application.Handlers.TopUp
{
    public class TopUpSteamHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IMediator _mediator, IPayService _payService, IBotStateReaderService _botStateReaderService, IAdminSettingsProvider _adminSettingsProvider, IUrlService _urlService) : DialogCommandHandler<TopUpSteamCommand>(_mediator, _translationsService), IRequestHandler<TopUpSteamCommand, Message>
    {
        private readonly decimal commissionRate = decimal.Parse(_adminSettingsProvider.CommissionRate.ToString()) / 100;
        private readonly long adminChatId = _adminSettingsProvider.AdminChatId;

        public async Task<Message> Handle(TopUpSteamCommand request, CancellationToken cancellationToken)
        {
            var oldState = await _botStateReaderService.GetChatStateAsync(request.ChatId);

            using var serviceScope = _serviceProvider.GetRequiredService<IServiceScopeFactory>().CreateScope();
            var userRepository = serviceScope.ServiceProvider.GetService(typeof(IUserRepository)) as IUserRepository;

            var user = await userRepository.GetUserByIdAsync(request.UserId);
            
            var steamLogin = oldState.UserState.ChoseSteamLogin;
            var discount = user.Discount / 100;

            await SendToChangeDialogStateAsync(request.ChatId);

            var totalAmount = request.Amount + request.Amount * (commissionRate - discount);

            var steamOrderRepository = serviceScope.ServiceProvider.GetService(typeof(ISteamOrderRepository)) as ISteamOrderRepository;

            var id = Guid.NewGuid().ToString();

            var pay = await _payService.CreatePaymentAsync(totalAmount, "RUB", $"Пополнение аккаунта {steamLogin}", "TODO", id);// TODO возвращение до реализации магазина на сайте
            
            var order = new SteamOrder()
            {
                Id = id,
                PayId = pay.Id,
                IsPaid = false,
                Amount = request.Amount,
                SteamLogin = steamLogin,
                TotalAmount = totalAmount,
                Username = user.Username,
                OrderCreationDate = DateTime.UtcNow
            };

            await steamOrderRepository.CreateOrderAsync(order);

            // Формируем сообщение пользователю с запросом на оплату
            string paymentMessage = string.Format(_translationsService.Translation.TopUpSteam, request.Amount, steamLogin, (commissionRate - discount) * 100, totalAmount, pay.ConfirmationUrl);

            // Отправляем сообщение пользователю
            var sentMessage = await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: paymentMessage,
                parseMode: ParseMode.Html,
                cancellationToken: cancellationToken
            );

            // После оплаты сохраняем данные в базе данных или отправляем сообщение администратору
            await NotifyAdmin(user.Username, steamLogin, request.Amount, totalAmount);

            return sentMessage;
        }

        // Уведомление администратора о пополнении
        private async Task NotifyAdmin(string username, string steamLogin, decimal amount, decimal totalAmount)
        {
            string adminMessage = string.Format(_translationsService.Translation.NotifyTopUpSteam, username, steamLogin, amount, totalAmount, "Нет");
            // Отправка уведомления админу (укажите здесь ID чата админа)
            await _botClient.SendTextMessageAsync(adminChatId, adminMessage, parseMode: ParseMode.Html);
        }
    }
}
