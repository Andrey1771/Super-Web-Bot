using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    public class BlogPostUniqueViewDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; }

        [BsonElement("postId")]
        public string PostId { get; set; }

        [BsonElement("viewerKey")]
        public string ViewerKey { get; set; }

        [BsonElement("userId")]
        public string UserId { get; set; }

        [BsonElement("anonId")]
        public string AnonId { get; set; }

        [BsonElement("isGuest")]
        public bool IsGuest { get; set; }

        [BsonElement("firstViewedAt")]
        public DateTime FirstViewedAt { get; set; }

        [BsonElement("lastViewedAt")]
        public DateTime LastViewedAt { get; set; }

        [BsonElement("firstSessionId")]
        public string FirstSessionId { get; set; }

        [BsonElement("lastSessionId")]
        public string LastSessionId { get; set; }

        [BsonElement("userAgentHash")]
        public string UserAgentHash { get; set; }

        [BsonElement("ipHash")]
        public string IpHash { get; set; }

        [BsonElement("countedInPublicCounts")]
        public bool CountedInPublicCounts { get; set; } = true;

        [BsonElement("isExcludedFromPublicCounts")]
        public bool IsExcludedFromPublicCounts { get; set; }

        [BsonElement("source")]
        public string Source { get; set; }

        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; }

        [BsonElement("updatedAt")]
        public DateTime UpdatedAt { get; set; }
    }
}
