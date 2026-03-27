namespace SuperBot.Core.Entities
{
    public class UserBlogProfile
    {
        public string Id { get; set; }
        public string UserId { get; set; }
        public string AnonId { get; set; }
        public Dictionary<string, double> TagWeights { get; set; } = new();
        public Dictionary<string, double> TopicWeights { get; set; } = new();
        public List<BlogReadingHistoryItem> ReadingHistory { get; set; } = new();
        public List<BlogShownItem> LastShown { get; set; } = new();
        public DateTime UpdatedAt { get; set; }
        public string MergedFromAnonId { get; set; }
    }

    public class BlogReadingHistoryItem
    {
        public string PostId { get; set; }
        public DateTime Timestamp { get; set; }
        public double Progress { get; set; }
        public int DwellMs { get; set; }
    }

    public class BlogShownItem
    {
        public string PostId { get; set; }
        public DateTime Timestamp { get; set; }
    }
}
