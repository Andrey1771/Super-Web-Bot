using SuperBot.Application.Commands.Base;

namespace SuperBot.Application.Commands.WithdrawalOfFunds
{
    public class PrepareWithdrawalOfFundsCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
        public long UserId { get; set; }
        public string ChoseCard { get; set; }
    }
}
