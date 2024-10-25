using MediatR;
using SuperBot.Application.Commands.WithdrawalOfFunds;
using SuperBot.Application.Handlers.Base;
using SuperBot.Core.Interfaces;
using Telegram.Bot.Types;
using Telegram.Bot;
using Telegram.Bot.Types.Enums;

namespace SuperBot.Application.Handlers.WithdrawalOfFunds
{
    public class OpenWithdrawalOfFundsHandler(ITelegramBotClient _botClient, IPayService _payService, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IMediator _mediator) : DialogCommandHandler<OpenWithdrawalOfFundsCommand>(_mediator), IRequestHandler<OpenWithdrawalOfFundsCommand, Message>
    {
        public async Task<Message> Handle(OpenWithdrawalOfFundsCommand request, CancellationToken cancellationToken)
        {
            var message = "Введите номер карты для вывода средств";

            // Отправляем сообщение пользователю
            return await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: message,
                parseMode: ParseMode.Html,
                cancellationToken: cancellationToken
            );
        }
    }
}
