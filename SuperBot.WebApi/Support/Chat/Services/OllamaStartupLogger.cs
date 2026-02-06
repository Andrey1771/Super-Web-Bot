using Microsoft.Extensions.Options;

namespace SuperBot.WebApi.Support.Chat.Services;

public class OllamaStartupLogger : IHostedService
{
    private readonly SupportChatOptions _options;
    private readonly ILogger<OllamaStartupLogger> _logger;
    private readonly HttpClient _httpClient;

    public OllamaStartupLogger(
        IOptions<SupportChatOptions> options,
        ILogger<OllamaStartupLogger> logger,
        IHttpClientFactory httpClientFactory)
    {
        _options = options.Value;
        _logger = logger;
        _httpClient = httpClientFactory.CreateClient();
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Initializing Ollama client with base URL {BaseUrl} and model {Model}.", _options.OllamaBaseUrl, _options.OllamaModel);
        try
        {
            var url = $"{_options.OllamaBaseUrl.TrimEnd('/')}/api/tags";
            var response = await _httpClient.GetAsync(url, cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation("Ollama is reachable. Model list fetched successfully.");
            }
            else
            {
                _logger.LogWarning("Ollama responded with status {StatusCode}.", response.StatusCode);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Ollama startup check failed. The service may not be running.");
        }
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Ollama startup logger stopped.");
        return Task.CompletedTask;
    }
}
