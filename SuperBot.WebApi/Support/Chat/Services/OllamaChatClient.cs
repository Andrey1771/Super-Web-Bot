using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace SuperBot.WebApi.Support.Chat.Services;

/// <summary>
/// Локальная Ollama. Остаётся резервом даже когда основным провайдером выбран DeepSeek:
/// на неё переключается <see cref="SupportLlmRouter"/>, если внешний API недоступен
/// или исчерпан дневной бюджет.
/// </summary>
public class OllamaChatClient : ISupportLlmClient
{
    private readonly HttpClient _httpClient;
    private readonly SupportChatOptions _options;
    private readonly ILogger<OllamaChatClient> _logger;
    private readonly JsonSerializerOptions _serializerOptions = new(JsonSerializerDefaults.Web);

    public OllamaChatClient(HttpClient httpClient, IOptions<SupportChatOptions> options, ILogger<OllamaChatClient> logger)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;
    }

    public string Model => _options.OllamaModel;

    public async Task<LlmChatResponse> ChatAsync(LlmChatRequest request, CancellationToken cancellationToken)
    {
        using var httpRequest = BuildRequest(request, stream: false);
        using var response = await _httpClient.SendAsync(httpRequest, cancellationToken);
        response.EnsureSuccessStatusCode();

        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        var payload = JsonSerializer.Deserialize<OllamaWireResponse>(content, _serializerOptions) ?? new OllamaWireResponse();

        return new LlmChatResponse
        {
            Content = payload.Message?.Content ?? string.Empty,
            ToolCall = MapToolCall(payload.Message),
            Usage = MapUsage(payload)
        };
    }

    public async Task StreamChatAsync(
        LlmChatRequest request,
        Func<LlmChatChunk, Task> onChunk,
        CancellationToken cancellationToken)
    {
        using var httpRequest = BuildRequest(request, stream: true);
        using var response = await _httpClient.SendAsync(httpRequest, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var reader = new StreamReader(stream);

        LlmToolCall? toolCall = null;
        LlmUsage? usage = null;

        while (!reader.EndOfStream && !cancellationToken.IsCancellationRequested)
        {
            var line = await reader.ReadLineAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            OllamaWireResponse? chunk;
            try
            {
                chunk = JsonSerializer.Deserialize<OllamaWireResponse>(line, _serializerOptions);
            }
            catch (JsonException ex)
            {
                _logger.LogWarning(ex, "Failed to parse Ollama chunk: {Line}", line);
                continue;
            }

            if (chunk == null)
            {
                continue;
            }

            toolCall ??= MapToolCall(chunk.Message);
            usage ??= MapUsage(chunk);

            var text = chunk.Message?.Content ?? string.Empty;
            if (!string.IsNullOrEmpty(text))
            {
                await onChunk(new LlmChatChunk { Content = text });
            }
        }

        if (toolCall != null || usage != null)
        {
            await onChunk(new LlmChatChunk { ToolCall = toolCall, Usage = usage });
        }
    }

    private HttpRequestMessage BuildRequest(LlmChatRequest request, bool stream)
    {
        var options = new Dictionary<string, object> { ["temperature"] = request.Temperature };
        if (request.MaxOutputTokens is > 0)
        {
            options["num_predict"] = request.MaxOutputTokens.Value;
        }

        var wire = new OllamaWireRequest
        {
            Model = _options.OllamaModel,
            Stream = stream,
            Options = options,
            Messages = request.Messages
                .Select(message => new OllamaWireMessage { Role = message.Role, Content = message.Content })
                .ToList(),
            Tools = request.Tools
                .Select(tool => new OllamaWireTool
                {
                    Function = new OllamaWireFunction
                    {
                        Name = tool.Name,
                        Description = tool.Description,
                        Parameters = tool.Parameters
                    }
                })
                .ToList()
        };

        var payload = JsonSerializer.Serialize(wire, _serializerOptions);
        return new HttpRequestMessage(HttpMethod.Post, $"{_options.OllamaBaseUrl.TrimEnd('/')}/api/chat")
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json")
        };
    }

    private static LlmToolCall? MapToolCall(OllamaWireMessage? message)
    {
        var call = message?.ToolCalls?.FirstOrDefault();
        if (call == null || string.IsNullOrWhiteSpace(call.Function.Name))
        {
            return null;
        }

        return new LlmToolCall { Name = call.Function.Name, ArgumentsJson = call.Function.ArgumentsJson };
    }

    // Локальная модель ничего не стоит: токены считаем ради наглядности, но Billable=false —
    // в деньги они не попадут.
    private static LlmUsage? MapUsage(OllamaWireResponse response)
    {
        if (response.PromptEvalCount == 0 && response.EvalCount == 0)
        {
            return null;
        }

        return new LlmUsage(response.PromptEvalCount, 0, response.EvalCount);
    }

    private class OllamaWireRequest
    {
        public string Model { get; set; } = string.Empty;

        public List<OllamaWireMessage> Messages { get; set; } = new();

        public bool Stream { get; set; }

        public List<OllamaWireTool> Tools { get; set; } = new();

        public Dictionary<string, object>? Options { get; set; }
    }

    private class OllamaWireMessage
    {
        public string Role { get; set; } = string.Empty;

        public string Content { get; set; } = string.Empty;

        [JsonPropertyName("tool_calls")]
        public List<OllamaWireToolCall>? ToolCalls { get; set; }
    }

    private class OllamaWireResponse
    {
        public OllamaWireMessage Message { get; set; } = new();

        public bool Done { get; set; }

        [JsonPropertyName("prompt_eval_count")]
        public int PromptEvalCount { get; set; }

        [JsonPropertyName("eval_count")]
        public int EvalCount { get; set; }
    }

    private class OllamaWireTool
    {
        public string Type { get; set; } = "function";

        public OllamaWireFunction Function { get; set; } = new();
    }

    private class OllamaWireFunction
    {
        public string Name { get; set; } = string.Empty;

        public string Description { get; set; } = string.Empty;

        public object Parameters { get; set; } = new();
    }

    private class OllamaWireToolCall
    {
        public OllamaWireToolCallFunction Function { get; set; } = new();
    }

    private class OllamaWireToolCallFunction
    {
        public string Name { get; set; } = string.Empty;

        // Ollama отдаёт аргументы объектом (а не строкой), поэтому забираем сырой JSON.
        public JsonElement? Arguments { get; set; }

        [JsonIgnore]
        public string ArgumentsJson =>
            Arguments is { ValueKind: not JsonValueKind.Undefined and not JsonValueKind.Null }
                ? Arguments.Value.GetRawText()
                : string.Empty;
    }
}
