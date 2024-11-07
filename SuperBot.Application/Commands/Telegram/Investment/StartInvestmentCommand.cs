using SuperBot.Application.Commands.Telegram.Base;

namespace SuperBot.Application.Commands.Investment
{
    public class StartInvestmentCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
    }
}
