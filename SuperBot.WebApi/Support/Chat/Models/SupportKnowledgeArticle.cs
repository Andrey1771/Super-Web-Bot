using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.WebApi.Support.Chat.Models;

/// <summary>
/// Одна тема поддержки: и материал для ответа модели, и — необязательно — готовый текст,
/// которым чат отвечает сам. Раньше это лежало двумя захардкоженными списками в коде,
/// поэтому дописать ответ на новый частый вопрос мог только разработчик с выкладкой.
/// </summary>
public class SupportKnowledgeArticle
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = string.Empty;

    /// <summary>Стабильный ключ темы: по нему обновляются сиды и не плодятся дубли.</summary>
    public string Slug { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Category { get; set; } = string.Empty;

    /// <summary>Слова, по которым тему находит поиск. Совпадение по ним весит больше всего.</summary>
    public List<string> Keywords { get; set; } = new();

    /// <summary>Материал для модели. Английский: модель пересказывает его на языке клиента.</summary>
    public string Content { get; set; } = string.Empty;

    public bool Enabled { get; set; } = true;

    public int SortOrder { get; set; }

    // --- Готовый ответ без обращения к модели -------------------------------------
    public bool InstantEnabled { get; set; }

    /// <summary>Тема опознана, когда сработала хотя бы одна альтернатива в каждой группе.</summary>
    public List<InstantTriggerGroup> InstantTriggers { get; set; } = new();

    public string? InstantTextRu { get; set; }

    public string? InstantTextEn { get; set; }

    public DateTime UpdatedAt { get; set; }

    public string? UpdatedBy { get; set; }
}

public class InstantTriggerGroup
{
    public List<string> Terms { get; set; } = new();
}
