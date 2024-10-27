using SuperBot.Application.Commands.Base;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SuperBot.Application.Commands
{
    public class ErrorCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
        public string ErrorMessage { get; set; }

    }
}
