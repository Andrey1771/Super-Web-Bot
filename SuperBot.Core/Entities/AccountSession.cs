namespace SuperBot.Core.Entities
{
    public class AccountSession
    {
        public Guid Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public string SessionId { get; set; } = string.Empty;
        public string IpAddress { get; set; } = string.Empty;
        public string UserAgent { get; set; } = string.Empty;
        public string DeviceName { get; set; } = string.Empty;
        public string Location { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public DateTime LastSeenAt { get; set; }
    }
}
