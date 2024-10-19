using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Bson;

namespace SuperBot.Infrastructure.Data
{
    public class GameDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; }

        [BsonElement("name")]
        public string Name { get; set; }

        [BsonElement("price")]
        public decimal Price { get; set; }

        [BsonElement("description")]
        public string Description { get; set; }

        [BsonElement("releaseDate")]
        public DateTime ReleaseDate { get; set; }
    }
}
