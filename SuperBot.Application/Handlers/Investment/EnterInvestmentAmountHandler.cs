using MediatR;
using SuperBot.Application.Commands.Base;
using SuperBot.Core.Entities;
using Telegram.Bot.Types;
using Telegram.Bot;
using SuperBot.Application.Commands.Investment;
using SuperBot.Application.Commands.TopUp;
using SuperBot.Application.Handlers.Base;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Interfaces.IBotStateService;
using SuperBot.Core.Interfaces;

namespace SuperBot.Application.Handlers.Investment
{
    public class EnterInvestmentAmountHandler(ITelegramBotClient _botClient, IMediator _mediator, IBotStateWriterService _botStateWriterService, IBotStateReaderService _botStateReaderService, ITranslationsService _translationsService) : DialogCommandHandler<EnterInvestmentAmountCommand>(_mediator, _translationsService), IRequestHandler<EnterInvestmentAmountCommand, Message>
    {
        public async Task<Message> Handle(EnterInvestmentAmountCommand request, CancellationToken cancellationToken)
        {
            // Проверка корректности суммы (можно добавить свои ограничения)
            if (request.Amount <= 0)
            {
                return await _botClient.SendTextMessageAsync(
                    chatId: request.ChatId,
                    text: _translationsService.Translation.SomeSumMoreThenZero,
                    cancellationToken: cancellationToken
                );
            }
            var oldState = await _botStateReaderService.GetChatStateAsync(request.UserId);
            oldState.UserState.ChoseAmountOfInvestment = request.Amount;

            await _botStateWriterService.SaveChatStateAsync(request.ChatId, oldState);

            // Переводим диалог в состояние ожидания срока инвестиций
            await SendToChangeDialogStateAsync(request.ChatId);

            return await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: _translationsService.Translation.EnterTimeOfInvest,
                cancellationToken: cancellationToken
            );
        }
    }
}
