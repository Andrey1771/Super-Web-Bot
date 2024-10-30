using MediatR;
using SuperBot.Application.Commands;
using SuperBot.Application.Handlers.Base;
using SuperBot.Core.Interfaces;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Telegram.Bot.Types;
using Telegram.Bot;
using Telegram.Bot.Types.Enums;

namespace SuperBot.Application.Handlers
{
    public class ErrorHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IMediator _mediator) : DialogCommandHandler<ErrorCommand>(_mediator, _translationsService), IRequestHandler<ErrorCommand, Message>
    {
        public async Task<Message> Handle(ErrorCommand request, CancellationToken cancellationToken)
        {
            await SendToChangeDialogStateAsync(request.ChatId);

            await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: GetText(request.ErrorMessage),
                parseMode: ParseMode.Html,
                //replyMarkup: GetKeyboard(request.ChatId),
                cancellationToken: cancellationToken);

            return await GetMainMenu(request.ChatId);
        }

        public string GetText(string error)
        {
            var stringBuilder = new StringBuilder();
            stringBuilder.AppendLine($"{_translationsService.Translation.ErrorOccurred}:\n{error}");
            return stringBuilder.ToString();
        }

        private Task<Message> GetMainMenu(long chatId)
        {
            var command = new GetMainMenuCommand();
            command.ChatId = chatId;

            return _mediator.Send(command);
        }
    }
}
