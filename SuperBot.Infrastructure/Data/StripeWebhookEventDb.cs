using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data;

/// <summary>
/// Журнал успешно обработанных событий Stripe. Stripe гарантирует доставку «хотя бы один раз»,
/// поэтому одно и то же событие может прийти повторно — здесь мы это распознаём.
/// Записи чистятся по TTL, вечно храниться им незачем.
/// </summary>
public class StripeWebhookEventDb
{
    [BsonId]
    public ObjectId Id { get; set; }

    public string EventId { get; set; } = string.Empty;
    public string EventType { get; set; } = string.Empty;
    public DateTime ProcessedAt { get; set; } = DateTime.UtcNow;
}
