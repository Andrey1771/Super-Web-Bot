using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.WebApi.Support.Chat.Models;

public class ChatMessage
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = string.Empty;

    [BsonRepresentation(BsonType.ObjectId)]
    public string SessionId { get; set; } = string.Empty;

    [BsonRepresentation(BsonType.String)]
    public ChatMessageRole Role { get; set; } = ChatMessageRole.User;

    public string AuthorName { get; set; } = string.Empty;

    public string Text { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    public ChatMessageMetadata Metadata { get; set; } = new();
}

public class ChatMessageMetadata
{
    public string? Model { get; set; }

    public double? Confidence { get; set; }

    public string? EscalationReason { get; set; }

    public string? ToolCall { get; set; }
}

public enum ChatMessageRole
{
    User,
    Assistant,
    Agent,
    System
}
