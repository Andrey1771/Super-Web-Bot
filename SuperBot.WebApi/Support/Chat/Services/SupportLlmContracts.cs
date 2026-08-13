namespace SuperBot.WebApi.Support.Chat.Services;

/// <summary>
/// Провайдер-независимый клиент чат-модели. За ним стоит либо локальная Ollama, либо внешний
/// DeepSeek — сервис поддержки о разнице не знает и работает с одними и теми же типами.
/// </summary>
public interface ISupportLlmClient
{
    /// <summary>Модель, которой отвечаем прямо сейчас: уходит в метаданные сообщения.</summary>
    string Model { get; }

    Task<LlmChatResponse> ChatAsync(LlmChatRequest request, CancellationToken cancellationToken);

    /// <summary>
    /// Потоковый ответ. Текст приходит кусками; вызов инструмента и расход токенов известны
    /// только к концу генерации, поэтому приезжают отдельным последним чанком.
    /// </summary>
    Task StreamChatAsync(LlmChatRequest request, Func<LlmChatChunk, Task> onChunk, CancellationToken cancellationToken);
}

public class LlmChatRequest
{
    public List<LlmChatMessage> Messages { get; set; } = new();

    public double Temperature { get; set; } = 0.3;

    /// <summary>Потолок длины ответа. null — не ограничивать.</summary>
    public int? MaxOutputTokens { get; set; }

    public List<LlmToolDefinition> Tools { get; set; } = new();
}

public class LlmChatMessage
{
    public string Role { get; set; } = string.Empty;

    public string Content { get; set; } = string.Empty;
}

public class LlmChatResponse
{
    public string Content { get; set; } = string.Empty;

    public LlmToolCall? ToolCall { get; set; }

    public LlmUsage? Usage { get; set; }
}

public class LlmChatChunk
{
    public string Content { get; set; } = string.Empty;

    public LlmToolCall? ToolCall { get; set; }

    public LlmUsage? Usage { get; set; }
}

/// <summary>
/// Аргументы всегда в виде JSON-строки: Ollama отдаёт объект, OpenAI-совместимые API — строку,
/// клиенты приводят к общему виду.
/// </summary>
public class LlmToolCall
{
    public string Name { get; set; } = string.Empty;

    public string ArgumentsJson { get; set; } = string.Empty;
}

public class LlmToolDefinition
{
    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public object Parameters { get; set; } = new();
}

/// <summary>Расход токенов за один вызов — по нему считается дневной бюджет.</summary>
public record LlmUsage(int InputTokens, int CachedInputTokens, int OutputTokens);
