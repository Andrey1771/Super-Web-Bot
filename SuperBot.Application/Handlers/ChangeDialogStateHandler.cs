using MediatR;
using SuperBot.Application.Commands;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IBotStateService;
using Telegram.Bot;
using Telegram.Bot.Types;

namespace SuperBot.Application.Handlers
{
    public class ChangeDialogStateHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IBotStateWriterService botStateWriterService) : IRequestHandler<ChangeDialogStateCommand, Message>
    {
        public async Task<Message> Handle(ChangeDialogStateCommand request, CancellationToken cancellationToken)
        {
            var chatState = new ChatState();
            chatState.LastInteractionTime = DateTime.UtcNow;
            chatState.DialogState = request.DialogState;

            await botStateWriterService.SaveChatStateAsync(request.ChatId, chatState);

            var text = request.Text;
            return text == "" ? await Task.FromResult<Message>(null) : await _botClient.SendTextMessageAsync(request.ChatId, text);
        }
    }
}
