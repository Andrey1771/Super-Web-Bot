namespace SuperBot.Core.Entities
{
    public class BlogPostUniqueView
    {
        public string Id { get; set; }
        public string PostId { get; set; }
        public string ViewerKey { get; set; }
        public string UserId { get; set; }
        public string AnonId { get; set; }
        public bool IsGuest { get; set; }
        public DateTime FirstViewedAt { get; set; }
        public DateTime LastViewedAt { get; set; }
        public string FirstSessionId { get; set; }
        public string LastSessionId { get; set; }
        public string UserAgentHash { get; set; }
        public string IpHash { get; set; }
        public bool IsExcludedFromPublicCounts { get; set; }
        public string Source { get; set; } = "blog-detail";
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
