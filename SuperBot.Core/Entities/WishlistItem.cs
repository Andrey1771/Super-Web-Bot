using System;

namespace SuperBot.Core.Entities
{
    public class WishlistItem
    {
        public string Id { get; set; }
        public string UserId { get; set; }
        public string GameId { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
