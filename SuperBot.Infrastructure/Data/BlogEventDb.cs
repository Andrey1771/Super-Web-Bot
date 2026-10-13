using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    public class BlogEventDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; }

        [BsonElement("userId")]
        public string UserId { get; set; }

        [BsonElement("anonId")]
        public string AnonId { get; set; }

        [BsonElement("sessionId")]
        public string SessionId { get; set; }

        [BsonElement("postId")]
        public string PostId { get; set; }

        [BsonElement("eventType")]
        public string EventType { get; set; }

        [BsonElement("ts")]
        public DateTime Timestamp { get; set; }

        [BsonElement("dwellMs")]
        public int? DwellMs { get; set; }

        [BsonElement("scrollDepth")]
        public double? ScrollDepth { get; set; }

        [BsonElement("referrer")]
        public string Referrer { get; set; }

        [BsonElement("meta")]
        public Dictionary<string, string> Meta { get; set; }
    }
}
