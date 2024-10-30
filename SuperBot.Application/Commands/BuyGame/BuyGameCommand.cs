using SuperBot.Application.Commands.Base;

namespace SuperBot.Application.Commands.BuyGame
{
    public class BuyGameCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
        public string FromUsername { get; set; }
        public string Text { get; set; }
    }
}