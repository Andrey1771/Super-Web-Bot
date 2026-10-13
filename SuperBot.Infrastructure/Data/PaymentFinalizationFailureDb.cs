using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data;

public class PaymentFinalizationFailureDb
{
    [BsonId]
    public ObjectId Id { get; set; }

    public string PaymentIntentId { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastSeenAt { get; set; } = DateTime.UtcNow;
    public int Attempts { get; set; }
    public string ErrorCode { get; set; } = string.Empty;
    public string ErrorMessage { get; set; } = string.Empty;
    public string? TechnicalDetails { get; set; }
    public string TraceId { get; set; } = string.Empty;
    public string Status { get; set; } = "Open";
    public string? OrderId { get; set; }
}
