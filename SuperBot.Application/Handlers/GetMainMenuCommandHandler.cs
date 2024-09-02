using MediatR;
using SuperBot.Application.Commands;
using Telegram.Bot.Types;

namespace SuperBot.Application.Handlers
{
    public class GetMainMenuCommandHandler : IRequestHandler<GetMainMenuCommand, Message>
    {
        public Task<Message> Handle(GetMainMenuCommand request, CancellationToken cancellationToken)
        {
            throw new NotImplementedException();
        }
    }
}
