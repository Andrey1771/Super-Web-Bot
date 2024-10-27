using SuperBot.Application.Commands.Base;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SuperBot.Application.Commands.InternationalTransfers
{
    public class OpenInternationalTransfersCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
        public long UserId { get; set; }
    }
}
