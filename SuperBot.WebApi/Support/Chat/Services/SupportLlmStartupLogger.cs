using Microsoft.Extensions.Options;

namespace SuperBot.WebApi.Support.Chat.Services;

/// <summary>
/// Один раз при старте пишет в лог, кем чат будет отвечать и доступен ли резерв. Настройка
/// провайдера — это боевой переключатель, и молчаливое падение на локальную модель нужно видеть.
/// </summary>
public class SupportLlmStartupLogger : IHostedService
{
    private readonly SupportChatOptions _options;
    private readonly ILogger<SupportLlmStartupLogger> _logger;
    private readonly HttpClient _httpClient;

    public SupportLlmStartupLogger(
        IOptions<SupportChatOptions> options,
        ILogger<SupportLlmStartupLogger> logger,
        IHttpClientFactory httpClientFactory)
    {
        _options = options.Value;
        _logger = logger;
        _httpClient = httpClientFactory.CreateClient();
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var wantsDeepSeek = string.Equals(_options.Provider, "deepseek", StringComparison.OrdinalIgnoreCase);
        if (wantsDeepSeek)
        {
            ReportDeepSeek();
        }
        else
        {
            _logger.LogInformation(
                "Support chat provider: local Ollama ({BaseUrl}, model {Model}).",
                _options.OllamaBaseUrl, _options.OllamaModel);
        }

        await CheckOllamaAsync(wantsDeepSeek, cancellationToken);
    }

    private void ReportDeepSeek()
    {
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(_options.DeepSeekApiKey))
        {
            missing.Add("SupportChat:DeepSeekApiKey");
        }
        if (string.IsNullOrWhiteSpace(_options.DeepSeekModel))
        {
            missing.Add("SupportChat:DeepSeekModel");
        }

        if (missing.Count > 0)
        {
            _logger.LogError(
                "Support chat provider is set to DeepSeek but {Missing} is not configured. Falling back to the local model.",
                string.Join(" and ", missing));
            return;
        }

        _logger.LogInformation(
            "Support chat provider: DeepSeek ({BaseUrl}, model {Model}, max {MaxTokens} output tokens, daily budget {Budget} USD).",
            _options.DeepSeekBaseUrl, _options.DeepSeekModel, _options.MaxResponseTokens,
            _options.DailyBudgetUsd > 0 ? _options.DailyBudgetUsd.ToString() : "unlimited");

        // Reasoning-модель для поддержки — деньги на ветер: её размышления оплачиваются как ответ.
        var model = _options.DeepSeekModel.ToLowerInvariant();
        if (model.Contains("reason") || model.Contains("r1"))
        {
            _logger.LogWarning(
                "Model {Model} looks like a reasoning model. Its thinking tokens are billed as output and add latency to a streamed support reply.",
                _options.DeepSeekModel);
        }
    }

    private async Task CheckOllamaAsync(bool asFallback, CancellationToken cancellationToken)
    {
        var role = asFallback ? "fallback" : "primary";
        try
        {
            var url = $"{_options.OllamaBaseUrl.TrimEnd('/')}/api/tags";
            var response = await _httpClient.GetAsync(url, cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation("Ollama ({Role}) is reachable.", role);
            }
            else
            {
                _logger.LogWarning("Ollama ({Role}) responded with status {StatusCode}.", role, response.StatusCode);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Ollama ({Role}) startup check failed. The service may not be running.", role);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
