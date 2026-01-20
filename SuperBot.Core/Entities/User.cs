using System.Collections.Generic;

namespace SuperBot.Core.Entities
{
    public class User
    {
        public string Id { get; set; }
        public long UserId { get; set; }
        public string Username { get; set; }
        public decimal Balance { get; set; }
        public int CountOfInvited { get; set; }
        public decimal Discount { get; set; }
        public int QuantityBeforeIncrease { get; set; }
        public List<string> WishlistGameIds { get; set; } = new();
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
