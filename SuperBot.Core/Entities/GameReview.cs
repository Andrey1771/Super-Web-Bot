using System;
using System.Collections.Generic;

namespace SuperBot.Core.Entities
{
    public enum ReviewStatus
    {
        Published,
        Hidden,
        Pending
    }

    public class GameReview
    {
        public string Id { get; set; }
        public string GameId { get; set; }
        public string UserId { get; set; }
        public string UserName { get; set; }
        public string AvatarUrl { get; set; }
        public bool VerifiedPurchase { get; set; }
        public int Rating { get; set; }
        public double? PlaytimeHours { get; set; }
        public string Text { get; set; }
        public List<ReviewImage> Images { get; set; } = new();
        public bool Recommend { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
        public int HelpfulCount { get; set; }
        public ReviewStatus Status { get; set; } = ReviewStatus.Published;
    }

    public class ReviewImage
    {
        public string Url { get; set; }
        public string ThumbUrl { get; set; }
    }
}
