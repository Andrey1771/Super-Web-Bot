using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    public class DealOfWeekSettingsDb
    {
        [BsonId]
        public string Id { get; set; } = "default";

        [BsonElement("hero_game_id")]
        public string? HeroGameId { get; set; }

        [BsonElement("wing_game_ids")]
        public List<string> WingGameIds { get; set; } = new();

        [BsonElement("updated_at")]
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
