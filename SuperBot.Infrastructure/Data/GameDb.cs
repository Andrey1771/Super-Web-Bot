using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Bson;
using SuperBot.Core.Entities;

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

        [BsonElement("title")]
        public string Title { get; set; }

        [BsonElement("gameType")]
        public GameType GameType { get; set; }

        [BsonElement("imagePath")]
        public string ImagePath { get; set; }

        [BsonElement("releaseDate")]
        public DateTime ReleaseDate { get; set; }
    }
}