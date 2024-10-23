using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SuperBot.Application.Commands
{
    public class TopUpSteamCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
    }
}
