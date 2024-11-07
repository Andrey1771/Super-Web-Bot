using SuperBot.Application.Commands.Telegram.Base;

namespace SuperBot.Application.Commands.WithdrawalOfFunds
{
    public class WithdrawalOfFundsCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
        public decimal Amount { get; set; }
        public string DestinationType { get; set; }
        public long UserID { get; set; }
    }
}
