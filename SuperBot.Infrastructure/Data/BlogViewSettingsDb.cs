using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    public class BlogViewSettingsDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; }

        [BsonElement("countGuestViewsInPublicCounts")]
        public bool CountGuestViewsInPublicCounts { get; set; } = true;

        [BsonElement("updatedAt")]
        public DateTime UpdatedAt { get; set; }

        [BsonElement("updatedBy")]
        public string UpdatedBy { get; set; }
    }
}
