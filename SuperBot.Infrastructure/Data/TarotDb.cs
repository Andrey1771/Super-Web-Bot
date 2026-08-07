using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    public class TarotSettingsDb
    {
        [BsonId]
        public string Id { get; set; } = "default";

        [BsonElement("enabled")]
        public bool Enabled { get; set; } = true;

        [BsonElement("cooldown_hours")]
        public int CooldownHours { get; set; } = 24;

        [BsonElement("code_ttl_hours")]
        public int CodeTtlHours { get; set; } = 24;

        [BsonElement("tiers")]
        public List<TarotLuckyTierDb> Tiers { get; set; } = new();

        [BsonElement("updated_at")]
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    public class TarotLuckyTierDb
    {
        [BsonElement("percent")]
        public decimal Percent { get; set; }

        [BsonElement("weight")]
        public int Weight { get; set; }
    }

    public class TarotDrawDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string? Id { get; set; }

        [BsonElement("user_id")]
        public string UserId { get; set; } = string.Empty;

        [BsonElement("code")]
        public string Code { get; set; } = string.Empty;

        [BsonElement("promo_code_id")]
        public string? PromoCodeId { get; set; }

        [BsonElement("percent")]
        public decimal Percent { get; set; }

        [BsonElement("drawn_at")]
        public DateTime DrawnAt { get; set; }

        [BsonElement("expires_at")]
        public DateTime ExpiresAt { get; set; }
    }
}
