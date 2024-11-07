using SuperBot.Application.Commands.Telegram.Base;

namespace SuperBot.Application.Commands.Investment
{
    public class EnterInvestmentDurationCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
        public long UserId { get; set; }
        public int Duration { get; set; }
    }
}
