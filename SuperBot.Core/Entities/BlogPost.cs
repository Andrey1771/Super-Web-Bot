namespace SuperBot.Core.Entities
{
    public class BlogPost
    {
        public string Id { get; set; }
        public string ExternalId { get; set; }
        public string Slug { get; set; }
        public string Title { get; set; }
        public string Excerpt { get; set; }
        public string CoverAssetId { get; set; }
        public string CoverUrl { get; set; }
        public string Status { get; set; }
        public DateTime? PublishedAt { get; set; }
        public DateTime? ScheduledAt { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public string AuthorId { get; set; }
        public string AuthorName { get; set; }
        public string[] Tags { get; set; } = Array.Empty<string>();
        public int? ReadingTime { get; set; }
        public string CurrentVersionId { get; set; }
        public int? ViewCount { get; set; }
    }
}
