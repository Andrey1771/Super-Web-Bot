using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SuperBot.Application.Commands
{
    public class OpenMyAccountCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
        public long UserID { get; set; }
        public string Name { get; set; }
    }
}
