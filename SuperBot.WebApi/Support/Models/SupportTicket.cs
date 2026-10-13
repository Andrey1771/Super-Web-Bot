using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.WebApi.Support.Models;

public enum SupportTicketStatus
{
    Open,
    WaitingForUser,
    WaitingForSupport,
    Resolved,
    Closed
}

public enum SupportPriority
{
    Normal,
    High
}

public enum SupportAuthorType
{
    User,
    Support,
    System
}

public class SupportTicket
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = string.Empty;

    [BsonElement("publicId")]
    public string PublicId { get; set; } = string.Empty;

    [BsonElement("userId")]
    public string UserId { get; set; } = string.Empty;

    [BsonElement("userEmail")]
    public string UserEmail { get; set; } = string.Empty;

    [BsonElement("subject")]
    public string Subject { get; set; } = string.Empty;

    [BsonElement("category")]
    public string Category { get; set; } = string.Empty;

    [BsonRepresentation(BsonType.String)]
    [BsonElement("status")]
    public SupportTicketStatus Status { get; set; } = SupportTicketStatus.Open;

    [BsonRepresentation(BsonType.String)]
    [BsonElement("priority")]
    public SupportPriority? Priority { get; set; }

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; }

    [BsonElement("updatedAt")]
    public DateTime UpdatedAt { get; set; }

    [BsonElement("lastMessageAt")]
    public DateTime LastMessageAt { get; set; }

    [BsonRepresentation(BsonType.String)]
    [BsonElement("lastMessageBy")]
    public SupportAuthorType? LastMessageBy { get; set; }

    [BsonElement("attachmentsCount")]
    public int AttachmentsCount { get; set; }

    [BsonElement("messagesCount")]
    public int MessagesCount { get; set; }

    [BsonElement("tags")]
    public List<string> Tags { get; set; } = new();
}
