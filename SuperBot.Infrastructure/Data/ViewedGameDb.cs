using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    public class ViewedGameDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; }

        public string UserId { get; set; }

        public string GameId { get; set; }

        public DateTime LastViewedAt { get; set; }

        public int ViewCount { get; set; }

        [BsonIgnoreIfNull]
        public string Source { get; set; }
    }
}
