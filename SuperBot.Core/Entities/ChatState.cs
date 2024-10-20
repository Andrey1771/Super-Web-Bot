using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SuperBot.Core.Entities
{
    public class ChatState
    {
        public DialogState DialogState { get; set; }
        public DateTime LastInteractionTime { get; set; }
    }
}
