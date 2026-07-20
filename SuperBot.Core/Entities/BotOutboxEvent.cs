namespace SuperBot.Core.Entities
{
    /// <summary>
    /// Событие в outbox: сайт пишет сюда вместо прямого вызова Telegram, бот-сервис забирает и исполняет.
    /// Так сайт полностью развязан с Telegram (event-driven), а доставка переживает простой бота.
    /// </summary>
    public class BotOutboxEvent
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string Type { get; set; } = string.Empty;
        public string PayloadJson { get; set; } = string.Empty;
        public string Status { get; set; } = BotOutboxStatuses.Pending;
        public int Attempts { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? ProcessedAt { get; set; }
        public string? LastError { get; set; }
    }

    public static class BotOutboxStatuses
    {
        public const string Pending = "pending";
        public const string Done = "done";
        public const string Failed = "failed";
    }

    public static class BotEventTypes
    {
        public const string KeysDelivered = "KeysDelivered";
        public const string GameDiscountActivated = "GameDiscountActivated";
        public const string SupportEscalation = "SupportEscalation";
    }
}
