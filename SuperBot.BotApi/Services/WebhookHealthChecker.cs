using System.Net;
using Microsoft.Extensions.Options;
using SuperBot.BotApi.Types;
using SuperBot.Core.Services;
using Telegram.Bot;

namespace SuperBot.BotApi.Services;

/// <summary>
/// Одно место, где выясняется, слышит ли бот людей.
///
/// Спрашивает у Telegram getWebhookInfo, сам стучится по зарегистрированному адресу и отдаёт
/// готовый диагноз. Вынесено из <see cref="WebhookHealthReporter"/>, потому что ответ нужен
/// двоим: логу при старте и админке сайта. Дублировать такую проверку нельзя — разъедутся,
/// и дашборд начнёт утверждать одно, а лог другое.
/// </summary>
public sealed class WebhookHealthChecker(
    ITelegramBotClient bot,
    IHttpClientFactory httpClientFactory,
    IOptions<BotConfiguration> config,
    ILogger<WebhookHealthChecker> logger)
{
    /// <summary>Запрос к Telegram не должен висеть дольше, чем человек смотрит в лог.</summary>
    private static readonly TimeSpan TelegramTimeout = TimeSpan.FromSeconds(15);

    /// <summary>Собственный адрес обязан отвечать быстро: он же принимает обновления.</summary>
    private static readonly TimeSpan ProbeTimeout = TimeSpan.FromSeconds(8);

    /// <summary>Токен не настроен — проверять нечего, и об этом уже сказано при старте.</summary>
    public bool IsConfigured => bot is not UnconfiguredTelegramBotClient;

    public async Task<WebhookHealthReport> CheckAsync(CancellationToken ct)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TelegramTimeout);

        var info = await bot.GetWebhookInfoAsync(timeout.Token);
        var (reachability, detail) = await ProbeAsync(info.Url, ct);

        return WebhookHealth.Inspect(
            info.Url,
            config.Value.BotWebhookUrl?.AbsoluteUri,
            info.LastErrorDate,
            info.LastErrorMessage,
            info.PendingUpdateCount,
            DateTime.UtcNow,
            reachability,
            detail);
    }

    /// <summary>
    /// Стучимся по зарегистрированному адресу и смотрим, наша ли там ручка.
    ///
    /// Метод GET выбран намеренно. Приём обновлений объявлен как [HttpPost], поэтому на GET
    /// наш сервис отвечает 405 — это подпись, которую не подделает ни заглушка туннеля, ни
    /// чужой сайт на освободившемся поддомене (там обычно 404). И, в отличие от POST, такой
    /// запрос не может случайно скормить боту пустое обновление.
    /// </summary>
    private async Task<(WebhookReachability Reachability, string? Detail)> ProbeAsync(
        string? url,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url, UriKind.Absolute, out var address))
        {
            return (WebhookReachability.NotChecked, null);
        }

        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(ProbeTimeout);

            var client = httpClientFactory.CreateClient();
            using var response = await client.GetAsync(address, HttpCompletionOption.ResponseHeadersRead, timeout.Token);

            return response.StatusCode == HttpStatusCode.MethodNotAllowed
                ? (WebhookReachability.Reachable, null)
                : (WebhookReachability.AnsweredWrong, $"answered {(int)response.StatusCode} to GET instead of 405");
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (OperationCanceledException)
        {
            return (WebhookReachability.NoAnswer, $"no answer within {ProbeTimeout.TotalSeconds:0}s");
        }
        catch (HttpRequestException exception)
        {
            logger.LogDebug(exception, "Webhook probe failed for {Url}", url);
            return (WebhookReachability.NoAnswer, exception.Message);
        }
    }
}
