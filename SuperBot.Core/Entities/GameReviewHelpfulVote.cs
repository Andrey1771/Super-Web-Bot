using System;

namespace SuperBot.Core.Entities
{
    public class GameReviewHelpfulVote
    {
        public string Id { get; set; }
        public string ReviewId { get; set; }
        public string UserId { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
