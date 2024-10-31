using SuperBot.Application.Commands.Base;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SuperBot.Application.Commands.TopUp
{
    public class ConfirmTopUpSteamCommand : BaseMessageCommand
    {
        public string OrderId { get; set; }
    }
}
