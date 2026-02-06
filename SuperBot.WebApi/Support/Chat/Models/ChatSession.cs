using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.WebApi.Support.Chat.Models;

public class ChatSession
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public string? UserId { get; set; }

    public string? Email { get; set; }

    public string? OrderId { get; set; }

    public string? Locale { get; set; }

    [BsonRepresentation(BsonType.String)]
    public ChatSessionStatus Status { get; set; } = ChatSessionStatus.Ai;

    public string? AssignedAgentId { get; set; }

    public string? AssignedAgentName { get; set; }

    public DateTime? LastMessageAt { get; set; }

    public List<string> Tags { get; set; } = new();

    [BsonRepresentation(BsonType.String)]
    public ChatPriority Priority { get; set; } = ChatPriority.Normal;

    public string? EscalationReason { get; set; }
}

public enum ChatSessionStatus
{
    Open,
    Ai,
    NeedsAgent,
    Assigned,
    Closed
}

public enum ChatPriority
{
    Low,
    Normal,
    High
}
