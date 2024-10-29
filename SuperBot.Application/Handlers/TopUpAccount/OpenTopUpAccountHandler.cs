using MediatR;
using SuperBot.Core.Interfaces;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Telegram.Bot.Types;
using Telegram.Bot;
using SuperBot.Core.Entities;
using Telegram.Bot.Types.Enums;
using SuperBot.Application.Handlers.Base;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Application.Commands.TopUp;

namespace SuperBot.Application.Handlers.TopUp
{
    public class OpenTopUpAccountHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IMediator _mediator) : DialogCommandHandler<OpenTopUpAccountCommand>(_mediator), IRequestHandler<OpenTopUpAccountCommand, Message>
    {
        public async Task<Message> Handle(OpenTopUpAccountCommand request, CancellationToken cancellationToken)
        {
            await SendToChangeDialogStateAsync(request.ChatId);

            return await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: GetMenuText(),
                parseMode: ParseMode.Html,
                //replyMarkup: GetKeyboard(request.ChatId),
                cancellationToken: cancellationToken);
        }

        public string GetMenuText()
        {
            var stringBuilder = new StringBuilder();
            stringBuilder.AppendLine(_translationsService.Translation.TopUpAmount);
            return stringBuilder.ToString();
        }
    }
}
