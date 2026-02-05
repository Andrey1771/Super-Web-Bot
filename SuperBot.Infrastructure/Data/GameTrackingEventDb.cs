using System;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    public class GameTrackingEventDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; }

        [BsonElement("gameId")]
        public string GameId { get; set; }

        [BsonElement("userId")]
        public string UserId { get; set; }

        [BsonElement("anonId")]
        public string AnonId { get; set; }

        [BsonElement("eventType")]
        public string EventType { get; set; }

        [BsonElement("mediaId")]
        public string MediaId { get; set; }

        [BsonElement("mediaType")]
        public string MediaType { get; set; }

        [BsonElement("timestamp")]
        public DateTime Timestamp { get; set; }
    }
}
