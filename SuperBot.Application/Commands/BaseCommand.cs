using MediatR;
using Telegram.Bot.Types;

namespace SuperBot.Application.Commands
{
    public class BaseCommand : IRequest<Message>
    {
    }
}
