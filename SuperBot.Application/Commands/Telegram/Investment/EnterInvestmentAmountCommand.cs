using SuperBot.Application.Commands.Telegram.Base;

namespace SuperBot.Application.Commands.Investment
{
    public class EnterInvestmentAmountCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
        public long UserId { get; set; }
        public decimal Amount { get; set; }
    }
}
