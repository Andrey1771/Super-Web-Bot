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

    // Detected intent category (from the handoff tool call or the support taxonomy).
    public string? Category { get; set; }

    // Best-effort detected language of the customer (e.g. "ru", "en"), so an agent knows what to expect.
    public string? Language { get; set; }

    // AI-generated conversation summary captured at escalation time for the specialist.
    public string? Summary { get; set; }
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
