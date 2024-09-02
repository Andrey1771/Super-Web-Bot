using MediatR;
using Telegram.Bot.Types;

namespace SuperBot.Application.Commands
{
    public class GetMainMenuCommand : IRequest<Message>
    {
        public long ChatId { get; set; }
    }
}
