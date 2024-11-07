using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using SuperBot.Application.Commands.Telegram.Base;

namespace SuperBot.Application.Commands.Telegram
{
    public class OpenStartCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
        public long UserId { get; set; }
        public string Username { get; set; }
    }
}
