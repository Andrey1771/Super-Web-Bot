using SuperBot.Application.Commands.Base;

namespace SuperBot.Application.Commands.Investment
{
    public class StartInvestmentCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
    }
}
