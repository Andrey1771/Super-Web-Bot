using MediatR;
using SuperBot.Application.Commands;
using SuperBot.Application.Handlers.Base;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Telegram.Bot.Types;

namespace SuperBot.Application.Handlers
{
    public class PrepareSecondTopUpSteamHandler(IMediator _mediator) : DialogCommandHandler<PrepareSecondTopUpSteamCommand>(_mediator), IRequestHandler<PrepareSecondTopUpSteamCommand, Message>
    {
        public Task<Message> Handle(PrepareSecondTopUpSteamCommand request, CancellationToken cancellationToken)
        {
            throw new NotImplementedException();
        }
    }
}
