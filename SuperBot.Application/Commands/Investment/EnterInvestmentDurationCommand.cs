using SuperBot.Application.Commands.Base;

namespace SuperBot.Application.Commands.Investment
{
    public class EnterInvestmentDurationCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
        public int Duration { get; set; }
        public decimal Amount { get; set; }
    }
}
