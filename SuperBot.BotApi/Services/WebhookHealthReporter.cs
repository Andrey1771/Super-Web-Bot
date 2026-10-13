using SuperBot.Core.Services;

namespace SuperBot.BotApi.Services;

/// <summary>
/// Проверка вебхука на старте.
///
/// Сервис поднимается одинаково и когда всё хорошо, и когда Telegram давно стучится в мёртвый
/// адрес: логи чистые, контейнер «Up», бот молчит. Так и вышло с ngrok — бесплатный поддомен
/// сменился, в Telegram остался старый, все обновления упирались в чужой 404, и понять это можно
/// было только вручную через getWebhookInfo. Теперь ответ на этот вопрос печатается там, где его
/// ищут в первую очередь: в `docker compose logs bot`.
///
/// Сам разбор живёт в <see cref="WebhookHealthChecker"/> — его же спрашивает админка сайта.
/// Проверка ничего не чинит и никогда не роняет сервис: вебхук регистрируют осознанно, из
/// админки, а самовольный setWebhook на старте увёл бы чужие обновления, если рядом поднят
/// второй экземпляр с тем же токеном.
/// </summary>
public sealed class WebhookHealthReporter(
    WebhookHealthChecker checker,
    ILogger<WebhookHealthReporter> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Токен уже проверен в Program: там же напечатана причина, и второй раз о ней
        // сообщать незачем.
        if (!checker.IsConfigured)
        {
            return;
        }

        try
        {
            var report = await checker.CheckAsync(stoppingToken);

            switch (report.Diagnosis)
            {
                case WebhookDiagnosis.NotRegistered:
                case WebhookDiagnosis.UrlMismatch:
                case WebhookDiagnosis.Unreachable:
                case WebhookDiagnosis.WrongResponse:
                case WebhookDiagnosis.DeliveryFailing:
                    // Error, а не Warning: бот в этом состоянии не работает вообще, и строка
                    // должна быть заметна в общем логе compose без фильтров.
                    logger.LogError("Telegram webhook: {Message}", report.Message);
                    break;
                default:
                    logger.LogInformation("Telegram webhook: {Message}", report.Message);
                    break;
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Сервис останавливают — молча выходим.
        }
        catch (Exception exception)
        {
            // Недоступный Telegram на старте не повод не запускаться: вебхук — входящий
            // канал, и он может ожить сам, без нашего участия.
            logger.LogWarning(exception, "Telegram webhook: could not check its state at startup.");
        }
    }
}
