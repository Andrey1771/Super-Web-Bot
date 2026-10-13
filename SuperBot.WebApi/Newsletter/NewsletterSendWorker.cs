namespace SuperBot.WebApi.Newsletter;

/// <summary>
/// Расписание рассылки: раз в PollInterval даёт NewsletterDispatcher'у обработать очередь
/// кампаний и проверить, не пора ли ставить суточный дайджест скидок.
/// Вся логика — в INewsletterDispatcher (там же её гоняют интеграционные тесты).
/// </summary>
public class NewsletterSendWorker : BackgroundService
{
    private static readonly TimeSpan StartupDelay = TimeSpan.FromSeconds(10);
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(30);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<NewsletterSendWorker> _logger;

    public NewsletterSendWorker(IServiceScopeFactory scopeFactory, ILogger<NewsletterSendWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Даём приложению подняться (Mongo-инициализация и т.п.).
        try
        {
            await Task.Delay(StartupDelay, stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        using var timer = new PeriodicTimer(PollInterval);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var dispatcher = scope.ServiceProvider.GetRequiredService<INewsletterDispatcher>();

                // Выгребаем всю очередь за тик (кампании ставятся редко, обычно 0–1).
                while (await dispatcher.ProcessQueuedCampaignAsync(stoppingToken))
                {
                }

                await dispatcher.MaybeQueueDealsDigestAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Newsletter worker tick failed");
            }

            try
            {
                await timer.WaitForNextTickAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
