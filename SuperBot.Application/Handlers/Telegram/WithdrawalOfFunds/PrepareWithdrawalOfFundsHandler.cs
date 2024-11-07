using MediatR;
using SuperBot.Application.Commands.WithdrawalOfFunds;
using SuperBot.Core.Interfaces;
using Telegram.Bot.Types;
using Telegram.Bot;
using Telegram.Bot.Types.Enums;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Interfaces.IBotStateService;
using SuperBot.Application.Handlers.Telegram.Base;

namespace SuperBot.Application.Handlers.Telegram.WithdrawalOfFunds
{
    public class PrepareWithdrawalOfFundsHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IMediator _mediator, IBotStateWriterService _botStateWriterService, IBotStateReaderService _botStateReaderService) : DialogCommandHandler<PrepareWithdrawalOfFundsCommand>(_mediator, _translationsService), IRequestHandler<PrepareWithdrawalOfFundsCommand, Message>
    {
        public async Task<Message> Handle(PrepareWithdrawalOfFundsCommand request, CancellationToken cancellationToken)
        {
            await SendToChangeDialogStateAsync(request.ChatId);

            var oldState = await _botStateReaderService.GetChatStateAsync(request.ChatId);
            oldState.UserState.ChoseCard = request.ChoseCard;

            await _botStateWriterService.SaveChatStateAsync(request.ChatId, oldState);

            var message = _translationsService.Translation.EnterAmountInRubles;

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
