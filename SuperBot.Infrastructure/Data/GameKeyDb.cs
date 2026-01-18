using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    public class GameKeyDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; }

        public string UserId { get; set; }

        public string GameId { get; set; }

        public string Key { get; set; }

        public string KeyType { get; set; }

        public DateTime IssuedAt { get; set; }

        public bool IsActive { get; set; }
    }
}
