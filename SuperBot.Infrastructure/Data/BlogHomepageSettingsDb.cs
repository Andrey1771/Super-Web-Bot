using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    public class BlogHomepageSettingsDb
    {
        [BsonId]
        public string Id { get; set; } = "default";

        [BsonElement("main_hero_post_id")]
        public string MainHeroPostId { get; set; }

        [BsonElement("updated_at")]
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        [BsonElement("updated_by")]
        public string UpdatedBy { get; set; }
    }
}
