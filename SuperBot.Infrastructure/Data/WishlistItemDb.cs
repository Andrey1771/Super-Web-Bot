using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using System;

namespace SuperBot.Infrastructure.Data
{
    public class WishlistItemDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        [BsonElement("id")]
        public string Id { get; set; }

        [BsonElement("userId")]
        public string UserId { get; set; }

        [BsonElement("gameId")]
        public string GameId { get; set; }

        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; }
    }
}
