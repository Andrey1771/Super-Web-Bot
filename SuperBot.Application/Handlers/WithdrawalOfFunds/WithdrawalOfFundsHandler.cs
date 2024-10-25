using MediatR;
using Microsoft.AspNetCore.Components.Routing;
using SuperBot.Application.Commands.WithdrawalOfFunds;
using SuperBot.Application.Handlers.Base;
using SuperBot.Core.Interfaces;
using Telegram.Bot;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;

namespace SuperBot.Application.Handlers.WithdrawalOfFunds
{
    public class WithdrawalOfFundsHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IMediator _mediator) : DialogCommandHandler<WithdrawalOfFundsCommand>(_mediator), IRequestHandler<WithdrawalOfFundsCommand, Message>
    {
        public async Task<Message> Handle(WithdrawalOfFundsCommand request, CancellationToken cancellationToken)
        {
            //string paymentMessage = $"Вы запросили пополнение на {request.Amount} ₽ для аккаунта Steam: {steamLogin}.\n" + //TODO Текст
            //                        $"Итого с комиссией {(commissionRate - discount) * 100}%: {totalAmount} ₽.\n" +
            //                        $"Пожалуйста, перейдите по ссылке для оплаты: <a href='{payLink}'>Ссылка</a>";

            // Отправляем сообщение пользователю
            //var sentMessage = await _botClient.SendTextMessageAsync(
            //    chatId: request.ChatId,
            //    text: paymentMessage,
            //    parseMode: ParseMode.Html,
            //    cancellationToken: cancellationToken
            //);
            throw new NotImplementedException();
        }
    }
}
