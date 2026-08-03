using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using SuperBot.Core.Entities;

namespace SuperBot.Infrastructure.Data;

public class CashbackTransactionDb
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    public string UserId { get; set; } = string.Empty;
    public string? OrderId { get; set; }

    [BsonRepresentation(BsonType.String)]
    public CashbackTransactionType Type { get; set; }

    public decimal Amount { get; set; }
    public decimal BalanceAfter { get; set; }
    public string? Note { get; set; }
    public DateTime CreatedAt { get; set; }
}
