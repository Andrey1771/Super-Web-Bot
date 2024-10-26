using SuperBot.Application.Commands.Base;

namespace SuperBot.Application.Commands.Investment
{
    public class EnterInvestmentAmountCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
        public decimal Amount { get; set; }
    }
}
