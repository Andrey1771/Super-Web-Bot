namespace SuperBot.Core.Entities
{
    public class BlogPostVersion
    {
        public string Id { get; set; }
        public string PostId { get; set; }
        public int VersionNumber { get; set; }
        public string Title { get; set; }
        public string Excerpt { get; set; }
        public string ContentMarkdown { get; set; }
        public string ContentHtml { get; set; }
        public string CoverAssetId { get; set; }
        public DateTime CreatedAt { get; set; }
        public string CreatedBy { get; set; }
        public string ChangeNote { get; set; }
    }
}
