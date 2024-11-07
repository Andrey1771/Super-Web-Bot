using SuperBot.Application.Commands.Telegram.Base;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Telegram.Bot.Types;

namespace SuperBot.Application.Commands.Investment
{
    public class InvestmentDecisionCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
        public string Decision { get; set; }
    }
}
