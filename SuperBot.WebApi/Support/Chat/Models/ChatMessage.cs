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

    // Marks the AI message that hands the conversation over to a human, so the UI can render a banner.
    public bool Handoff { get; set; }

    // Расход и цена этого ответа. Заполняются только когда отвечал платный провайдер:
    // у локальной модели токены есть, а стоимости нет.
    public int? InputTokens { get; set; }

    public int? CachedInputTokens { get; set; }

    public int? OutputTokens { get; set; }

    public double? CostUsd { get; set; }

    // Ответ выдан из заготовки, без обращения к модели. Тема нужна, чтобы не повторять
    // тот же шаблон второй раз в одном диалоге.
    public bool Instant { get; set; }

    public string? InstantTopic { get; set; }

    // Оценка ответа клиентом. Единственный дешёвый способ понять, какие темы бот тянет плохо.
    [BsonRepresentation(BsonType.String)]
    public ChatMessageFeedback? Feedback { get; set; }
}

public enum ChatMessageFeedback
{
    Helpful,
    NotHelpful
}

public enum ChatMessageRole
{
    User,
    Assistant,
    Agent,
    System
}
