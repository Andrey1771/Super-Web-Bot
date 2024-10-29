using MediatR;
using SuperBot.Application.Commands.WithdrawalOfFunds;
using SuperBot.Application.Handlers.Base;
using SuperBot.Core.Interfaces;
using Telegram.Bot.Types;
using Telegram.Bot;
using Telegram.Bot.Types.Enums;

namespace SuperBot.Application.Handlers.WithdrawalOfFunds
{
    public class OpenWithdrawalOfFundsHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IMediator _mediator) : DialogCommandHandler<OpenWithdrawalOfFundsCommand>(_mediator), IRequestHandler<OpenWithdrawalOfFundsCommand, Message>
    {
        public async Task<Message> Handle(OpenWithdrawalOfFundsCommand request, CancellationToken cancellationToken)
        {
            var message = _translationsService.Translation.EnterCardNumberToWithdrawFunds;

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
