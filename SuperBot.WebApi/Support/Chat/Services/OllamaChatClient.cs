using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace SuperBot.WebApi.Support.Chat.Services;

public class OllamaChatClient : IOllamaChatClient
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

    public async Task<OllamaChatResponse> ChatAsync(OllamaChatRequest request, CancellationToken cancellationToken)
    {
        var payload = JsonSerializer.Serialize(request, _serializerOptions);
        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, $"{_options.OllamaBaseUrl.TrimEnd('/')}/api/chat")
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json")
        };

        using var response = await _httpClient.SendAsync(httpRequest, cancellationToken);
        response.EnsureSuccessStatusCode();
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        return JsonSerializer.Deserialize<OllamaChatResponse>(content, _serializerOptions) ?? new OllamaChatResponse();
    }

    public async Task StreamChatAsync(
        OllamaChatRequest request,
        Func<OllamaChatResponse, Task> onChunk,
        CancellationToken cancellationToken)
    {
        var payload = JsonSerializer.Serialize(request, _serializerOptions);
        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, $"{_options.OllamaBaseUrl.TrimEnd('/')}/api/chat")
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json")
        };

        using var response = await _httpClient.SendAsync(httpRequest, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var reader = new StreamReader(stream);

        while (!reader.EndOfStream && !cancellationToken.IsCancellationRequested)
        {
            var line = await reader.ReadLineAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            try
            {
                var chunk = JsonSerializer.Deserialize<OllamaChatResponse>(line, _serializerOptions);
                if (chunk != null)
                {
                    await onChunk(chunk);
                }
            }
            catch (JsonException ex)
            {
                _logger.LogWarning(ex, "Failed to parse Ollama chunk: {Line}", line);
            }
        }
    }
}

public interface IOllamaChatClient
{
    Task<OllamaChatResponse> ChatAsync(OllamaChatRequest request, CancellationToken cancellationToken);

    Task StreamChatAsync(OllamaChatRequest request, Func<OllamaChatResponse, Task> onChunk, CancellationToken cancellationToken);
}

public class OllamaChatRequest
{
    public string Model { get; set; } = string.Empty;

    public List<OllamaChatMessage> Messages { get; set; } = new();

    public bool Stream { get; set; }

    public List<OllamaToolDefinition> Tools { get; set; } = new();

    public Dictionary<string, object>? Options { get; set; }
}

public class OllamaChatMessage
{
    public string Role { get; set; } = string.Empty;

    public string Content { get; set; } = string.Empty;

    [JsonPropertyName("tool_calls")]
    public List<OllamaToolCall> ToolCalls { get; set; } = new();
}

public class OllamaChatResponse
{
    public OllamaChatMessage Message { get; set; } = new();

    public bool Done { get; set; }
}

public class OllamaToolDefinition
{
    public string Type { get; set; } = "function";

    public OllamaFunctionDefinition Function { get; set; } = new();
}

public class OllamaFunctionDefinition
{
    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public object Parameters { get; set; } = new();
}

public class OllamaToolCall
{
    public OllamaToolCallFunction Function { get; set; } = new();
}

public class OllamaToolCallFunction
{
    public string Name { get; set; } = string.Empty;

    public string Arguments { get; set; } = string.Empty;
}
