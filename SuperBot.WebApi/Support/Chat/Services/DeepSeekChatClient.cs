using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace SuperBot.WebApi.Support.Chat.Services;

/// <summary>
/// DeepSeek через OpenAI-совместимый /chat/completions. Отличий от Ollama три, и все они
/// спрятаны здесь: другой адрес и авторизация, SSE вместо построчного JSON, а аргументы
/// вызова инструмента приходят строкой и по кускам — их приходится собирать.
/// </summary>
public class DeepSeekChatClient : ISupportLlmClient
{
    private readonly HttpClient _httpClient;
    private readonly SupportChatOptions _options;
    private readonly ILogger<DeepSeekChatClient> _logger;
    private readonly JsonSerializerOptions _serializerOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public DeepSeekChatClient(HttpClient httpClient, IOptions<SupportChatOptions> options, ILogger<DeepSeekChatClient> logger)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;
    }

    public string Model => _options.DeepSeekModel;

    /// <summary>Без ключа и имени модели провайдер считается ненастроенным — роутер его не выбирает.</summary>
    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_options.DeepSeekApiKey) && !string.IsNullOrWhiteSpace(_options.DeepSeekModel);

    public async Task<LlmChatResponse> ChatAsync(LlmChatRequest request, CancellationToken cancellationToken)
    {
        using var httpRequest = BuildRequest(request, stream: false);
        using var response = await _httpClient.SendAsync(httpRequest, cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);

        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        var payload = JsonSerializer.Deserialize<CompletionResponse>(content, _serializerOptions) ?? new CompletionResponse();
        var message = payload.Choices.FirstOrDefault()?.Message;
        var call = message?.ToolCalls?.FirstOrDefault();

        return new LlmChatResponse
        {
            Content = message?.Content ?? string.Empty,
            ToolCall = call == null || string.IsNullOrWhiteSpace(call.Function.Name)
                ? null
                : new LlmToolCall { Name = call.Function.Name, ArgumentsJson = call.Function.Arguments ?? string.Empty },
            Usage = MapUsage(payload.Usage)
        };
    }

    public async Task StreamChatAsync(
        LlmChatRequest request,
        Func<LlmChatChunk, Task> onChunk,
        CancellationToken cancellationToken)
    {
        using var httpRequest = BuildRequest(request, stream: true);
        using var response = await _httpClient.SendAsync(httpRequest, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var reader = new StreamReader(stream);

        // Имя инструмента приходит в одном чанке, аргументы — по буквам в следующих.
        var toolName = string.Empty;
        var toolArguments = new StringBuilder();
        LlmUsage? usage = null;

        while (!cancellationToken.IsCancellationRequested)
        {
            var line = await reader.ReadLineAsync(cancellationToken);
            if (line == null)
            {
                break;
            }

            if (!line.StartsWith("data:", StringComparison.Ordinal))
            {
                continue; // пустые строки-разделители и комментарии SSE
            }

            var data = line["data:".Length..].Trim();
            if (data.Length == 0)
            {
                continue;
            }

            if (data == "[DONE]")
            {
                break;
            }

            CompletionChunk? chunk;
            try
            {
                chunk = JsonSerializer.Deserialize<CompletionChunk>(data, _serializerOptions);
            }
            catch (JsonException ex)
            {
                _logger.LogWarning(ex, "Failed to parse DeepSeek chunk: {Line}", data);
                continue;
            }

            if (chunk == null)
            {
                continue;
            }

            usage ??= MapUsage(chunk.Usage);

            var delta = chunk.Choices.FirstOrDefault()?.Delta;
            if (delta == null)
            {
                continue;
            }

            foreach (var call in delta.ToolCalls ?? Enumerable.Empty<WireToolCall>())
            {
                if (!string.IsNullOrWhiteSpace(call.Function.Name))
                {
                    toolName = call.Function.Name;
                }
                if (!string.IsNullOrEmpty(call.Function.Arguments))
                {
                    toolArguments.Append(call.Function.Arguments);
                }
            }

            if (!string.IsNullOrEmpty(delta.Content))
            {
                await onChunk(new LlmChatChunk { Content = delta.Content });
            }
        }

        var toolCall = string.IsNullOrWhiteSpace(toolName)
            ? null
            : new LlmToolCall { Name = toolName, ArgumentsJson = toolArguments.ToString() };

        if (toolCall != null || usage != null)
        {
            await onChunk(new LlmChatChunk { ToolCall = toolCall, Usage = usage });
        }
    }

    private HttpRequestMessage BuildRequest(LlmChatRequest request, bool stream)
    {
        var wire = new CompletionRequest
        {
            Model = _options.DeepSeekModel,
            Temperature = request.Temperature,
            MaxTokens = request.MaxOutputTokens,
            Stream = stream,
            // Расход токенов нужен для дневного бюджета, иначе в стриме его не присылают.
            StreamOptions = stream ? new StreamOptions { IncludeUsage = true } : null,
            Messages = request.Messages
                .Select(message => new WireMessage { Role = message.Role, Content = message.Content })
                .ToList(),
            // Пустой массив tools некоторые OpenAI-совместимые API отклоняют — не отправляем его вовсе.
            Tools = request.Tools.Count == 0
                ? null
                : request.Tools
                    .Select(tool => new WireTool
                    {
                        Function = new WireFunction
                        {
                            Name = tool.Name,
                            Description = tool.Description,
                            Parameters = tool.Parameters
                        }
                    })
                    .ToList()
        };

        var payload = JsonSerializer.Serialize(wire, _serializerOptions);
        var httpRequest = new HttpRequestMessage(HttpMethod.Post, $"{_options.DeepSeekBaseUrl.TrimEnd('/')}/chat/completions")
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json")
        };
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.DeepSeekApiKey);
        return httpRequest;
    }

    // Тело ошибки от провайдера объясняет причину (нет денег, неверная модель) — тащим его в лог.
    private static async Task EnsureSuccessAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode)
        {
            return;
        }

        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        throw new HttpRequestException(
            $"DeepSeek responded with {(int)response.StatusCode}: {Shorten(body, 400)}",
            null,
            response.StatusCode);
    }

    private static string Shorten(string value, int max) =>
        string.IsNullOrEmpty(value) || value.Length <= max ? value : value[..max] + "…";

    private static LlmUsage? MapUsage(WireUsage? usage)
    {
        if (usage == null)
        {
            return null;
        }

        // Попадание в кэш стоит в десятки раз дешевле промаха, поэтому считаем их раздельно.
        var cached = usage.PromptCacheHitTokens;
        var fresh = usage.PromptCacheMissTokens > 0 ? usage.PromptCacheMissTokens : usage.PromptTokens - cached;
        return new LlmUsage(Math.Max(fresh, 0), cached, usage.CompletionTokens);
    }

    private class CompletionRequest
    {
        public string Model { get; set; } = string.Empty;

        public List<WireMessage> Messages { get; set; } = new();

        public double Temperature { get; set; }

        [JsonPropertyName("max_tokens")]
        public int? MaxTokens { get; set; }

        public bool Stream { get; set; }

        [JsonPropertyName("stream_options")]
        public StreamOptions? StreamOptions { get; set; }

        public List<WireTool>? Tools { get; set; }
    }

    private class StreamOptions
    {
        [JsonPropertyName("include_usage")]
        public bool IncludeUsage { get; set; }
    }

    private class WireMessage
    {
        public string Role { get; set; } = string.Empty;

        public string Content { get; set; } = string.Empty;

        // Провайдер может прислать "tool_calls": null — поле должно это переживать.
        [JsonPropertyName("tool_calls")]
        public List<WireToolCall>? ToolCalls { get; set; }
    }

    private class WireTool
    {
        public string Type { get; set; } = "function";

        public WireFunction Function { get; set; } = new();
    }

    private class WireFunction
    {
        public string Name { get; set; } = string.Empty;

        public string Description { get; set; } = string.Empty;

        public object Parameters { get; set; } = new();
    }

    private class WireToolCall
    {
        public int Index { get; set; }

        public string? Id { get; set; }

        public WireToolCallFunction Function { get; set; } = new();
    }

    private class WireToolCallFunction
    {
        public string Name { get; set; } = string.Empty;

        /// <summary>В OpenAI-совместимом формате аргументы — строка с JSON, а в стриме ещё и по частям.</summary>
        public string? Arguments { get; set; }
    }

    private class CompletionResponse
    {
        public List<Choice> Choices { get; set; } = new();

        public WireUsage? Usage { get; set; }
    }

    private class Choice
    {
        public WireMessage? Message { get; set; }
    }

    private class CompletionChunk
    {
        public List<ChunkChoice> Choices { get; set; } = new();

        public WireUsage? Usage { get; set; }
    }

    private class ChunkChoice
    {
        public WireMessage? Delta { get; set; }
    }

    private class WireUsage
    {
        [JsonPropertyName("prompt_tokens")]
        public int PromptTokens { get; set; }

        [JsonPropertyName("completion_tokens")]
        public int CompletionTokens { get; set; }

        [JsonPropertyName("prompt_cache_hit_tokens")]
        public int PromptCacheHitTokens { get; set; }

        [JsonPropertyName("prompt_cache_miss_tokens")]
        public int PromptCacheMissTokens { get; set; }
    }
}
