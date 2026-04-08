namespace SuperBot.Core.Entities
{
    public class BlogViewSettings
    {
        public string Id { get; set; } = "default";
        public bool CountGuestViewsInPublicCounts { get; set; } = true;
        public DateTime UpdatedAt { get; set; }
        public string UpdatedBy { get; set; }
    }
}
