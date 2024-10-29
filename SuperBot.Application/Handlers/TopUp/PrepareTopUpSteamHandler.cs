using MediatR;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Application.Commands.TopUp;
using SuperBot.Application.Handlers.Base;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IBotStateService;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Services;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Telegram.Bot;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;

namespace SuperBot.Application.Handlers.TopUp
{
    public class PrepareTopUpSteamHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IMediator _mediator, IBotStateWriterService _botStateWriterService, IBotStateReaderService _botStateReaderService) : DialogCommandHandler<PrepareTopUpSteamCommand>(_mediator, _translationsService), IRequestHandler<PrepareTopUpSteamCommand, Message>
    {
        public async Task<Message> Handle(PrepareTopUpSteamCommand request, CancellationToken cancellationToken)
        {
            await SendToChangeDialogStateAsync(request.ChatId);

            var oldState = await _botStateReaderService.GetChatStateAsync(request.UserId);
            oldState.UserState.ChoseSteamLogin = request.SteamLogin;

            await _botStateWriterService.SaveChatStateAsync(request.ChatId, oldState);

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
            stringBuilder.AppendLine(_translationsService.Translation.TopUpAmount);
            return stringBuilder.ToString();
        }
    }
}
