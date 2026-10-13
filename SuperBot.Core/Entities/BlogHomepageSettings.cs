namespace SuperBot.Core.Entities
{
    public class BlogHomepageSettings
    {
        public string Id { get; set; } = "default";
        public string MainHeroPostId { get; set; }
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        public string UpdatedBy { get; set; }
    }
}
