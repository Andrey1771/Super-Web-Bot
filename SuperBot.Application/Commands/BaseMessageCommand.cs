using MediatR;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Telegram.Bot.Types;

namespace SuperBot.Application.Commands
{
    public class BaseMessageCommand : IRequest<Message>
    {
    }
}
