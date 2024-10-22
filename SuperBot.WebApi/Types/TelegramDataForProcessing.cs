using SuperBot.Core.Entities;

namespace SuperBot.WebApi.Types
{
    public class TelegramDataForProcessing
    {
        public string CommandName { get; set; }
        public long ChatId { get; set; }
        public string Text { get; set; }
        public string FromUsername { get; set; }
    }
}
