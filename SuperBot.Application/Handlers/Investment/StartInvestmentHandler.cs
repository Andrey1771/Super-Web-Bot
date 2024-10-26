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
    public class StartInvestmentHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IPayService _payService, IMediator _mediator) : DialogCommandHandler<StartInvestmentCommand>(_mediator), IRequestHandler<StartInvestmentCommand, Message>
    {
        public async Task<Message> Handle(StartInvestmentCommand request, CancellationToken cancellationToken)
        {
            // Переводим диалог в состояние ожидания срока инвестиций
            await SendToChangeDialogStateAsync(request.ChatId);

            return await _botClient.SendTextMessageAsync(
                    chatId: request.ChatId,
                    text: "Введите сумму инвестирования\r\n\r\n",
                    cancellationToken: cancellationToken
            );
        }
    }
}
