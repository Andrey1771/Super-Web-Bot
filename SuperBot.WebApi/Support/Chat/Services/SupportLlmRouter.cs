using Microsoft.Extensions.Options;

namespace SuperBot.WebApi.Support.Chat.Services;

/// <summary>
/// Выбирает, кем отвечать: внешним DeepSeek или локальной Ollama. Провайдер задаётся настройкой
/// SupportChat:Provider, но выбор не жёсткий — на локальную модель переключаемся, если внешний
/// API недоступен, не настроен или выбран дневной бюджет. Чат отвечает в любом случае.
/// </summary>
public class SupportLlmRouter : ISupportLlmClient
{
    private const string DeepSeekProvider = "deepseek";

    private readonly DeepSeekChatClient _deepSeek;
    private readonly OllamaChatClient _ollama;
    private readonly SupportChatOptions _options;
    private readonly ILlmSpendTracker _spend;
    private readonly LlmProviderHealth _health;
    private readonly ILogger<SupportLlmRouter> _logger;

    public SupportLlmRouter(
        DeepSeekChatClient deepSeek,
        OllamaChatClient ollama,
        IOptions<SupportChatOptions> options,
        ILlmSpendTracker spend,
        LlmProviderHealth health,
        ILogger<SupportLlmRouter> logger)
    {
        _deepSeek = deepSeek;
        _ollama = ollama;
        _options = options.Value;
        _spend = spend;
        _health = health;
        _logger = logger;
    }

    public string Model => UseDeepSeek ? _deepSeek.Model : _ollama.Model;

    private bool UseDeepSeek =>
        string.Equals(_options.Provider, DeepSeekProvider, StringComparison.OrdinalIgnoreCase)
        && _deepSeek.IsConfigured
        && _health.IsPrimaryAvailable
        && _spend.IsWithinBudget;

    public async Task<LlmChatResponse> ChatAsync(LlmChatRequest request, CancellationToken cancellationToken)
    {
        if (!UseDeepSeek)
        {
            return await LocalChatAsync(request, cancellationToken);
        }

        try
        {
            var response = await _deepSeek.ChatAsync(request, cancellationToken);
            _spend.Record(response.Usage);
            return response;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Отмена и таймаут сюда не попадают: их обрабатывает сам сервис своим сообщением.
            PenalizePrimary(ex);
        }

        return await LocalChatAsync(request, cancellationToken);
    }

    public async Task StreamChatAsync(
        LlmChatRequest request,
        Func<LlmChatChunk, Task> onChunk,
        CancellationToken cancellationToken)
    {
        if (!UseDeepSeek)
        {
            await LocalStreamAsync(request, onChunk, cancellationToken);
            return;
        }

        var alreadyStreamed = false;
        try
        {
            await _deepSeek.StreamChatAsync(
                request,
                async chunk =>
                {
                    if (!string.IsNullOrEmpty(chunk.Content))
                    {
                        alreadyStreamed = true;
                    }
                    _spend.Record(chunk.Usage);
                    await onChunk(chunk);
                },
                cancellationToken);
            return;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            PenalizePrimary(ex);

            // Часть ответа уже на экране у клиента — переиграть её другой моделью нельзя.
            if (alreadyStreamed)
            {
                throw;
            }
        }

        await LocalStreamAsync(request, onChunk, cancellationToken);
    }

    // Токены локальной модели в бюджет не пишем: он считает деньги, а Ollama бесплатна —
    // иначе резервный провайдер сам бы и выбирал дневной лимит.
    private Task<LlmChatResponse> LocalChatAsync(LlmChatRequest request, CancellationToken cancellationToken) =>
        _ollama.ChatAsync(request, cancellationToken);

    private Task LocalStreamAsync(LlmChatRequest request, Func<LlmChatChunk, Task> onChunk, CancellationToken cancellationToken) =>
        _ollama.StreamChatAsync(request, onChunk, cancellationToken);

    private void PenalizePrimary(Exception ex)
    {
        var cooldown = TimeSpan.FromSeconds(Math.Max(1, _options.ProviderCooldownSeconds));
        _health.PenalizePrimary(cooldown);
        _logger.LogWarning(
            ex,
            "DeepSeek call failed, falling back to the local model for the next {Cooldown} seconds.",
            cooldown.TotalSeconds);
    }
}

/// <summary>
/// Состояние основного провайдера, общее на весь процесс: после сбоя он ненадолго исключается
/// из выбора, чтобы каждый следующий клиент не ждал таймаута заново.
/// </summary>
public class LlmProviderHealth
{
    private long _blockedUntilTicks;

    public bool IsPrimaryAvailable => DateTime.UtcNow.Ticks >= Interlocked.Read(ref _blockedUntilTicks);

    public void PenalizePrimary(TimeSpan cooldown) =>
        Interlocked.Exchange(ref _blockedUntilTicks, DateTime.UtcNow.Add(cooldown).Ticks);
}
