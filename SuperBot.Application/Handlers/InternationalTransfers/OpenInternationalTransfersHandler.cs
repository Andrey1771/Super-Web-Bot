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
using SuperBot.Core.Interfaces;

namespace SuperBot.Application.Handlers.InternationalTransfers
{
    public class OpenInternationalTransfersHandler(ITelegramBotClient _botClient, IMediator _mediator, ITranslationsService _translationsService) : DialogCommandHandler<OpenInternationalTransfersCommand>(_mediator), IRequestHandler<OpenInternationalTransfersCommand, Message>
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
            stringBuilder.AppendLine(_translationsService.Translation.ProvideTransferDetails);
            return stringBuilder.ToString();
        }
    }
}
