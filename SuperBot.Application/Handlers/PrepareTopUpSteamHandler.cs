using MediatR;
using SuperBot.Application.Commands;
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

namespace SuperBot.Application.Handlers
{
    public class PrepareTopUpSteamHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IMediator mediator) : IRequestHandler<PrepareTopUpSteamCommand, Message>
    {
        public async Task<Message> Handle(PrepareTopUpSteamCommand request, CancellationToken cancellationToken)
        {
            await SendToChangeDialogStateAsync(request.ChatId);

            return await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: GetMenuText(),
                parseMode: ParseMode.Html,
                //replyMarkup: GetKeyboard(request.ChatId),
                cancellationToken: cancellationToken);
        }

        private Task<Message> SendToChangeDialogStateAsync(long chatId, DialogState dialogState)
        {
            var command = new ChangeDialogStateCommand();
            command.ChatId = chatId;
            command.DialogState = dialogState;
            command.Text = "";
            return mediator.Send(command);
        }

        public string GetMenuText()
        {
            var stringBuilder = new StringBuilder();
            stringBuilder.AppendLine($"Введите логин стим");
            //stringBuilder.AppendLine($"<b><u>{_translationsService.Translation.Account}:</u></b>");
            //stringBuilder.AppendLine(string.Format(_translationsService.Translation.AccountBody, name, userID, balance));
            return stringBuilder.ToString();
        }
    }
}
