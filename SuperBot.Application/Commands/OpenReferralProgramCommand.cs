using SuperBot.Application.Commands.Base;

namespace SuperBot.Application.Commands
{
    public class OpenReferralProgramCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
        public long UserId { get; set; }
    }
}
