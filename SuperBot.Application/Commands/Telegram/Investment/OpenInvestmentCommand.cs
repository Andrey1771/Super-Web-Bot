using SuperBot.Application.Commands.Telegram.Base;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SuperBot.Application.Commands.Investment
{
    public class OpenInvestmentCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
    }
}
