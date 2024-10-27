using SuperBot.Application.Commands.Base;

namespace SuperBot.Application.Commands.InternationalTransfers
{
    public class InternationalTransfersCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
        public string Username { get; set; }

        public string Text { get; set; }
    }
}
