namespace SuperBot.Application.Commands
{
    public class BuyGameCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
        public string FromUsername { get; set; }
        public string Text { get; set; }
    }
}