using MediatR;
using SuperBot.Application.Commands.Base;
using Telegram.Bot.Types;

namespace SuperBot.Application.Commands
{
    public class GetMainMenuCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
    }
}
