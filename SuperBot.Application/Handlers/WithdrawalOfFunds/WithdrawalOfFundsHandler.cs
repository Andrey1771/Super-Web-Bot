using MediatR;
using Microsoft.AspNetCore.Components.Routing;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Application.Commands.WithdrawalOfFunds;
using SuperBot.Application.Handlers.Base;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IBotStateService;
using SuperBot.Core.Interfaces.IRepositories;
using Telegram.Bot;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;

namespace SuperBot.Application.Handlers.WithdrawalOfFunds
{
    public class WithdrawalOfFundsHandler(ITelegramBotClient _botClient, IPayService _payService, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IMediator _mediator, IBotStateReaderService _botStateReaderService) : DialogCommandHandler<WithdrawalOfFundsCommand>(_mediator, _translationsService), IRequestHandler<WithdrawalOfFundsCommand, Message>
    {
        public async Task<Message> Handle(WithdrawalOfFundsCommand request, CancellationToken cancellationToken)
        {
            var oldState = await _botStateReaderService.GetChatStateAsync(request.UserID);

            await SendToChangeDialogStateAsync(request.ChatId);

            string paymentMessage = string.Format(_translationsService.Translation.WithdrawalOfFundsMessage, request.Amount, oldState.UserState.ChoseCard); //TODO Текст //TODO Учитывать тип

            // Отправляем сообщение пользователю
            await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: paymentMessage,
                parseMode: ParseMode.Html,
                cancellationToken: cancellationToken
            );

            var response = await _payService.CreatePayoutAsync(request.Amount, "RUB", request.DestinationType, oldState.UserState.ChoseCard);
            return await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: response,
                parseMode: ParseMode.Html,
                cancellationToken: cancellationToken
            );
        }
    }
}
