using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.WebApi.Support.Models;

public class SupportAttachment
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = string.Empty;

    [BsonRepresentation(BsonType.ObjectId)]
    [BsonElement("ticketId")]
    public string TicketId { get; set; } = string.Empty;

    [BsonRepresentation(BsonType.ObjectId)]
    [BsonElement("messageId")]
    public string MessageId { get; set; } = string.Empty;

    [BsonElement("uploadedByUserId")]
    public string UploadedByUserId { get; set; } = string.Empty;

    [BsonElement("fileName")]
    public string FileName { get; set; } = string.Empty;

    [BsonElement("contentType")]
    public string ContentType { get; set; } = string.Empty;

    [BsonElement("sizeBytes")]
    public long SizeBytes { get; set; }

    [BsonRepresentation(BsonType.ObjectId)]
    [BsonElement("storageId")]
    public string StorageId { get; set; } = string.Empty;

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; }
}

public class SupportTicketCounter
{
    [BsonId]
    public string Id { get; set; } = "support_ticket";

    [BsonElement("seq")]
    public long Seq { get; set; }
}
