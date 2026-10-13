namespace SuperBot.Core.Entities
{
    public class BlogEvent
    {
        public string Id { get; set; }
        public string UserId { get; set; }
        public string AnonId { get; set; }
        public string SessionId { get; set; }
        public string PostId { get; set; }
        public string EventType { get; set; }
        public DateTime Timestamp { get; set; }
        public int? DwellMs { get; set; }
        public double? ScrollDepth { get; set; }
        public string Referrer { get; set; }
        public Dictionary<string, string> Meta { get; set; } = new();
    }
}
