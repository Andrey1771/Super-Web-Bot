namespace SuperBot.Core.Entities
{
    public class TelegramMessage
    {
        public string Text { get; set; }
        public Chat Chat { get; set; }
        public From From { get; set; }
        public string chatFirstName { get; set; }
        public string chatLastName { get; set; }
        public DateTime chatDateTime { get; set; }
    }

    public class Chat
    {
        public long Id { get; set; }
    }

    public class From
    {
        public string LanguageCode { get; set; }
    }
}
