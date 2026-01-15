using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    public class WishlistDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; }

        [BsonElement("userId")]
        public string UserId { get; set; }

        [BsonElement("wishlistGames")]
        public WishlistGameDb[] WishlistGames { get; set; }
    }

    public class WishlistGameDb
    {
        [BsonRepresentation(BsonType.ObjectId)]
        [BsonElement("gameId")]
        public string GameId { get; set; }

        [BsonElement("name")]
        public string Name { get; set; }

        [BsonElement("price")]
        public decimal Price { get; set; }

        [BsonElement("image")]
        public string Image { get; set; }
    }
}
