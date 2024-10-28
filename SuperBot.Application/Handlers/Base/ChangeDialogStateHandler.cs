using MediatR;
using SuperBot.Application.Commands.Base;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IBotStateService;
using Telegram.Bot;
using Telegram.Bot.Types;

namespace SuperBot.Application.Handlers.Base
{
    public class ChangeDialogStateHandler(ITelegramBotClient _botClient, IBotStateWriterService botStateWriterService, IBotStateReaderService _botStateReaderService) : IRequestHandler<ChangeDialogStateCommand, Message>
    {
        public async Task<Message> Handle(ChangeDialogStateCommand request, CancellationToken cancellationToken)
        {
            var state = await _botStateReaderService.GetChatStateAsync(request.ChatId);

            if (state == null)
            {
                state = new ChatState
                {
                    LastInteractionTime = DateTime.UtcNow,
                    DialogState = request.DialogState,
                    UserState = new UserState
                    {
                        ChoseAmountOfInvestment = 0,
                        ChoseCard = "",
                        ChoseSteamLogin = ""
                    }
                };
            }

            state.DialogState = request.DialogState;

            await botStateWriterService.SaveChatStateAsync(request.ChatId, state);

            var text = request.Text;
            return text == "" ? await Task.FromResult<Message>(null) : await _botClient.SendTextMessageAsync(request.ChatId, text);
        }
    }
}
