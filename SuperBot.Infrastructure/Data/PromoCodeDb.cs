using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using SuperBot.Core.Entities;

namespace SuperBot.Infrastructure.Data;

public class PromoCodeDb
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    public string Code { get; set; } = string.Empty;
    [BsonRepresentation(BsonType.String)]
    public PromoCodeType Type { get; set; }
    public decimal Value { get; set; }

    /// <summary>Валюта абсолютных сумм. Пусто у промокодов до мультивалютности — читается как USD.</summary>
    [BsonIgnoreIfNull]
    public string? Currency { get; set; }

    public decimal? MinOrderAmount { get; set; }
    public decimal? MaxDiscountAmount { get; set; }
    public bool FirstOrderOnly { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public int? UsageLimit { get; set; }
    public int? UsagePerUser { get; set; }
    public DateTime CreatedAt { get; set; }
}
