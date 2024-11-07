using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using SuperBot.Application.Commands.Telegram.Base;

namespace SuperBot.Application.Commands.TopUp
{
    public class OpenTopUpAccountCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
    }
}
