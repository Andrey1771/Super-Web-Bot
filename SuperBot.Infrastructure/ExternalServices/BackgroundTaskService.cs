using Hangfire;
using MediatR;
using SuperBot.Application.Commands;
using SuperBot.Core.Interfaces;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SuperBot.Infrastructure.ExternalServices
{
    public class BackgroundTaskService(IMediator _mediator) : IBackgroundTaskService
    {
        public void ScheduleClearOutdatedDataJob()
        {
            _mediator.Send(new ClearOldOrderRecordsCommand(), CancellationToken.None);
        }
    }
}
