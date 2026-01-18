namespace SuperBot.Core.Entities
{
    public class GameKey
    {
        public string UserId { get; set; }
        public string GameId { get; set; }
        public string Key { get; set; }
        public string KeyType { get; set; }
        public DateTime IssuedAt { get; set; }
        public bool IsActive { get; set; }
    }
}
