using MediatR;
using SuperBot.Core.Interfaces;
using Telegram.Bot.Types;
using Telegram.Bot;
using Telegram.Bot.Types.Enums;
using SuperBot.Application.Handlers.Base;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Application.Commands.TopUp;

namespace SuperBot.Application.Handlers.TopUp
{
    public class TopUpSteamHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IMediator mediator, IPayService _payService) : DialogCommandHandler<TopUpSteamCommand>(mediator), IRequestHandler<TopUpSteamCommand, Message>
    {
        // TODO Вынести в конфиг
        private const decimal commissionRate = 0.15m;// 15% комиссия
        private const long adminChatId = 795184375;// TODO!

        public async Task<Message> Handle(TopUpSteamCommand request, CancellationToken cancellationToken)
        {
            using var serviceScope = _serviceProvider.GetRequiredService<IServiceScopeFactory>().CreateScope();
            var userRepository = serviceScope.ServiceProvider.GetService(typeof(IUserRepository)) as IUserRepository;

            var user = await userRepository.GetUserDetailsAsync(request.UserId);

            var steamLogin = user.ChoseSteamLogin;
            var discount = user.Discount / 100;

            await SendToChangeDialogStateAsync(request.ChatId);

            var totalAmount = request.Amount + request.Amount * (commissionRate - discount);

            var payLink = await _payService.CreatePaymentAsync(totalAmount, "RUB", $"Пополнение аккаунта {steamLogin}", "TODO");

            // Формируем сообщение пользователю с запросом на оплату
            string paymentMessage = $"Вы запросили пополнение на {request.Amount} ₽ для аккаунта Steam: {steamLogin}.\n" + //TODO Текст
                                    $"Итого с комиссией {(commissionRate - discount) * 100}%: {totalAmount} ₽.\n" +
                                    $"Пожалуйста, перейдите по ссылке для оплаты: <a href='{payLink}'>Ссылка</a>";

            // Отправляем сообщение пользователю
            var sentMessage = await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: paymentMessage,
                parseMode: ParseMode.Html,
                cancellationToken: cancellationToken
            );

            // После оплаты сохраняем данные в базе данных или отправляем сообщение администратору
            await NotifyAdmin(request.ChatId, steamLogin, request.Amount, totalAmount);

            return sentMessage;
        }

        // Уведомление администратора о пополнении
        private async Task NotifyAdmin(long chatId, string steamLogin, decimal amount, decimal totalAmount)
        {
            string adminMessage = $"Пополнение баланса Steam:\n" +//TODO Текст
                                  $"Пользователь Telegram ID: {chatId}\n" +
                                  $"Логин Steam: {steamLogin}\n" +
                                  $"Сумма: {amount} ₽\n" +
                                  $"Сумма с комиссией: {totalAmount} ₽" +
                                  "Оплатил: нет";

            // Отправка уведомления админу (укажите здесь ID чата админа)
            await _botClient.SendTextMessageAsync(adminChatId, adminMessage, parseMode: ParseMode.Html);
        }
    }
}
