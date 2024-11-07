using SuperBot.Application.Commands.Telegram.Base;

namespace SuperBot.Application.Commands.WithdrawalOfFunds
{
    public class OpenWithdrawalOfFundsCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
    }
}
