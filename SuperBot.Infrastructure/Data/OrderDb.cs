using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    public class OrderDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; }

        public string GameId { get; set; }
        public string GameName { get; set; }
        public string UserName { get; set; }
        public DateTime OrderDate { get; set; }
    }
}
