using MediatR;
using SuperBot.Application.Commands.Investment;
using SuperBot.Application.Handlers.Base;
using SuperBot.Core.Interfaces;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Telegram.Bot;
using Telegram.Bot.Types;

namespace SuperBot.Application.Handlers.Investment
{
    public class StartInvestmentHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IMediator _mediator) : DialogCommandHandler<StartInvestmentCommand>(_mediator, _translationsService), IRequestHandler<StartInvestmentCommand, Message>
    {
        public async Task<Message> Handle(StartInvestmentCommand request, CancellationToken cancellationToken)
        {
            // Переводим диалог в состояние ожидания срока инвестиций
            await SendToChangeDialogStateAsync(request.ChatId);

            return await _botClient.SendTextMessageAsync(
                    chatId: request.ChatId,
                    text: _translationsService.Translation.EnterInvestmentAmount,
                    cancellationToken: cancellationToken
            );
        }
    }
}
