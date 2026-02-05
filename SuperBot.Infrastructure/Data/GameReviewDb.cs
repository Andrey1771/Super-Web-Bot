using System;
using System.Collections.Generic;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    public class GameReviewDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; }

        [BsonElement("gameId")]
        public string GameId { get; set; }

        [BsonElement("userId")]
        public string UserId { get; set; }

        [BsonElement("userName")]
        public string UserName { get; set; }

        [BsonElement("avatarUrl")]
        public string AvatarUrl { get; set; }

        [BsonElement("verifiedPurchase")]
        public bool VerifiedPurchase { get; set; }

        [BsonElement("rating")]
        public int Rating { get; set; }

        [BsonElement("playtimeHours")]
        public double? PlaytimeHours { get; set; }

        [BsonElement("text")]
        public string Text { get; set; }

        [BsonElement("images")]
        public List<ReviewImageDb> Images { get; set; } = new();

        [BsonElement("recommend")]
        public bool Recommend { get; set; }

        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; }

        [BsonElement("updatedAt")]
        public DateTime? UpdatedAt { get; set; }

        [BsonElement("helpfulCount")]
        public int HelpfulCount { get; set; }

        [BsonElement("status")]
        public string Status { get; set; }
    }

    public class ReviewImageDb
    {
        [BsonElement("url")]
        public string Url { get; set; }

        [BsonElement("thumbUrl")]
        public string ThumbUrl { get; set; }
    }
}
