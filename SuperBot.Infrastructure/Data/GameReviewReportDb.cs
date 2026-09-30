using System;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    public class GameReviewReportDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; }

        [BsonElement("reviewId")]
        public string ReviewId { get; set; }

        [BsonElement("userId")]
        public string UserId { get; set; }

        [BsonElement("userName")]
        public string UserName { get; set; }

        /// <summary>Имя enum-значения (Spam, Abusive, …): читается глазами в базе и не ломается при перестановке enum.</summary>
        [BsonElement("reason")]
        public string Reason { get; set; }

        [BsonElement("comment")]
        public string? Comment { get; set; }

        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; }
    }
}
