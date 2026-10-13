using Microsoft.Extensions.Options;

namespace SuperBot.WebApi.Demo;

/// <summary>
/// Демо-сайт: раз в <see cref="DemoOptions.KeyTopUpMinutes"/> доливает демо-ключи до <see cref="DemoOptions.KeysPerProduct"/>.
/// Посетители покупают тестовой картой по-настоящему, и ключи расходуются; без доливки игры уходили бы в «нет в наличии».
/// Ключи вида DEMO-XXXXX ничего не активируют. На обычном магазине не запускается.
/// </summary>
public sealed class DemoKeyTopUpWorker(IServiceScopeFactory scopes, IOptions<DemoOptions> options, ILogger<DemoKeyTopUpWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var demo = options.Value;
        if (!demo.Enabled)
        {
            return;
        }

        try
        {
            // Старт не нагружаем: первая доливка — через минуту.
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = scopes.CreateScope();
                    var (added, _) = await DemoKeysCli.TopUpAsync(scope.ServiceProvider, demo.KeysPerProduct, stoppingToken);
                    if (added > 0)
                    {
                        logger.LogInformation("Demo keys topped up: {Added} added.", added);
                    }
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogWarning(ex, "Demo key top-up failed; will retry.");
                }
                await Task.Delay(TimeSpan.FromMinutes(Math.Max(1, demo.KeyTopUpMinutes)), stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }
}
