using MediatR;
using SuperBot.Application.Commands;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IBotStateService;

namespace SuperBot.Application.Handlers
{
    public class ChangeDialogStateHandler(IBotStateWriterService botStateWriterService) : IRequestHandler<ChangeDialogStateCommand>
    {
        public Task Handle(ChangeDialogStateCommand request, CancellationToken cancellationToken)
        {
            var chatState = new ChatState();
            chatState.LastInteractionTime = DateTime.UtcNow;
            chatState.DialogState = request.DialogState;

            botStateWriterService.SaveChatStateAsync(request.ChatId, chatState);
            return Task.CompletedTask;
        }
    }
}
