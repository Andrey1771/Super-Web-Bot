using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Bson;

namespace SuperBot.Infrastructure.Data
{
    public class GameCategoryDb
    {
        public string Tag { get; set; }
        public string Title { get; set; }
    }

    public class SettingsDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.String)]
        public string Id { get; set; }

        public GameCategoryDb[] GameCategories {  get; set; }
    }
}