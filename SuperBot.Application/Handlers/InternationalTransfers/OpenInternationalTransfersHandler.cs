using MediatR;
using SuperBot.Application.Commands.InternationalTransfers;
using SuperBot.Application.Handlers.Base;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Telegram.Bot.Types;
using Telegram.Bot;
using Telegram.Bot.Types.Enums;

namespace SuperBot.Application.Handlers.InternationalTransfers
{
    public class OpenInternationalTransfersHandler(ITelegramBotClient _botClient, IServiceProvider _serviceProvider, IMediator _mediator) : DialogCommandHandler<OpenInternationalTransfersCommand>(_mediator), IRequestHandler<OpenInternationalTransfersCommand, Message>
    {
        public async Task<Message> Handle(OpenInternationalTransfersCommand request, CancellationToken cancellationToken)
        {
            await SendToChangeDialogStateAsync(request.ChatId);

            return await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: GetText(),
                parseMode: ParseMode.Html,
                //replyMarkup: GetKeyboard(request.ChatId),
                cancellationToken: cancellationToken);
        }

        public string GetText()
        {
            var stringBuilder = new StringBuilder();
            stringBuilder.AppendLine($"Укажите данные перевода:\n\nОткуда (страна):\nКуда (страна):\nСумма (валюта):");
            //stringBuilder.AppendLine($"<b><u>{_translationsService.Translation.Account}:</u></b>");
            //stringBuilder.AppendLine(string.Format(_translationsService.Translation.AccountBody, name, userID, balance));
            return stringBuilder.ToString();
        }
    }
}
