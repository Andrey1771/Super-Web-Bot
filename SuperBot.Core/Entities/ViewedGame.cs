namespace SuperBot.Core.Entities
{
    public class ViewedGame
    {
        public string UserId { get; set; }
        public string GameId { get; set; }
        public DateTime LastViewedAt { get; set; }
        public int ViewCount { get; set; }
        public string Source { get; set; }
    }
}
