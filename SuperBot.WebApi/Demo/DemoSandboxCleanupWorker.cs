using Microsoft.Extensions.Options;

namespace SuperBot.WebApi.Demo;

/// <summary>Раз в десять минут удаляет истёкшие песочницы и держит наготове запасные копии (и сразу после выдачи запасной).</summary>
public sealed class DemoSandboxCleanupWorker(DemoSandboxService sandboxes, IOptions<DemoOptions> options, ILogger<DemoSandboxCleanupWorker> logger)
    : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(10);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.Enabled)
        {
            return;
        }
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await sandboxes.ShiftTemplateUpcomingAsync(stoppingToken);
                var removed = await sandboxes.CleanupAsync(stoppingToken);
                var built = await sandboxes.RefillSparesAsync(stoppingToken);
                if (removed > 0 || built > 0)
                {
                    logger.LogInformation("Demo sandboxes: {Removed} removed, {Built} spare copies built.", removed, built);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Demo sandbox maintenance failed.");
            }
            // Следующий круг — по расписанию или сразу, как только выдали запасную копию.
            await sandboxes.RefillRequested.WaitAsync(Interval, stoppingToken);
        }
    }
}
