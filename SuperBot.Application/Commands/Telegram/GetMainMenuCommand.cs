using MediatR;
using SuperBot.Application.Commands.Telegram.Base;
using Telegram.Bot.Types;

namespace SuperBot.Application.Commands.Telegram
{
    public class GetMainMenuCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
    }
}
