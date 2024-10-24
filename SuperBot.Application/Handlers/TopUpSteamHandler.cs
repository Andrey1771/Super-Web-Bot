using MediatR;
using SuperBot.Application.Commands;
using SuperBot.Core.Interfaces;
using Telegram.Bot.Types;
using Telegram.Bot;
using Telegram.Bot.Types.Enums;
using SuperBot.Application.Handlers.Base;

namespace SuperBot.Application.Handlers
{
    public class TopUpSteamHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IMediator mediator) : DialogCommandHandler<TopUpSteamCommand>(mediator), IRequestHandler<TopUpSteamCommand, Message>
    {
        // TODO Вынести в конфиг
        private const decimal commissionRate = 0.15m;// 15% комиссия
        private const long adminChatId = 795184375;// TODO!

        public async Task<Message> Handle(TopUpSteamCommand request, CancellationToken cancellationToken)
        {
            await SendToChangeDialogStateAsync(request.ChatId);

            var totalAmount = request.Amount + (request.Amount * commissionRate);

            // Формируем сообщение пользователю с запросом на оплату
            string paymentMessage = $"Вы запросили пополнение на {request.Amount} ₽ для аккаунта Steam: {request.SteamLogin}.\n" + //TODO Текст
                                    $"Итого с комиссией 15%: {totalAmount} ₽.\n" +
                                    $"Пожалуйста, перейдите по ссылке для оплаты: [Оплатить]";

            // Отправляем сообщение пользователю
            var sentMessage = await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: paymentMessage,
                parseMode: ParseMode.Html,
                cancellationToken: cancellationToken
            );

            // После оплаты сохраняем данные в базе данных или отправляем сообщение администратору
            await NotifyAdmin(request.ChatId, request.SteamLogin, request.Amount, totalAmount);

            return sentMessage;
        }

        // Уведомление администратора о пополнении
        private async Task NotifyAdmin(long chatId, string steamLogin, decimal amount, decimal totalAmount)
        {
            string adminMessage = $"Пополнение баланса Steam:\n" +//TODO Текст
                                  $"Пользователь Telegram ID: {chatId}\n" +
                                  $"Логин Steam: {steamLogin}\n" +
                                  $"Сумма: {amount} ₽\n" +
                                  $"Сумма с комиссией: {totalAmount} ₽";

            // Отправка уведомления админу (укажите здесь ID чата админа)
            await _botClient.SendTextMessageAsync(adminChatId, adminMessage, parseMode: ParseMode.Html);
        }
    }
}
