using SuperBot.Application.Commands.Telegram.Base;

namespace SuperBot.Application.Commands.Telegram
{
    public class OpenReferralProgramCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
        public long UserId { get; set; }
    }
}
