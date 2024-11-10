using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Bson;

namespace SuperBot.Infrastructure.Data
{
    public class SettingsDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; }

        public string[] GameCategories {  get; set; }
    }
}
