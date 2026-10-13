using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data;

public class PromoCodeUsageDb
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    public string PromoCodeId { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public string? OrderId { get; set; }
    public DateTime UsedAt { get; set; }
}
