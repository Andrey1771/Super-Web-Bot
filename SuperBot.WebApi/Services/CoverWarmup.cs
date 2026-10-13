using System.Threading.Channels;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Очередь обложек на заблаговременную нарезку (<see cref="ICoverImages.PrerenderAsync"/>). Ставят в неё загрузка
/// обложки (админка, импорт из Steam) и смена точки фокуса; сама нарезка идёт в фоне, загрузка её не ждёт.
/// </summary>
public interface ICoverWarmupQueue
{
    void Enqueue(string relativePath);
}

public sealed class CoverWarmupQueue : ICoverWarmupQueue
{
    // Без SingleReader: у такой очереди есть Count (по нему воркер понимает, что разобрал всё); у однопоточной — нет.
    private readonly Channel<string> _channel = Channel.CreateUnbounded<string>();

    public ChannelReader<string> Reader => _channel.Reader;

    public void Enqueue(string relativePath)
    {
        if (!string.IsNullOrWhiteSpace(relativePath))
        {
            _channel.Writer.TryWrite(relativePath);
        }
    }
}

/// <summary>
/// Нарезает обложки заранее, чтобы первый посетитель каталога не ждал, пока сервер (одно ядро) по очереди режет
/// 24 картинки. После запуска один раз проходит по всему каталогу (готовые варианты пропускаются, так что повторный
/// проход почти ничего не стоит), дальше — по очереди из <see cref="CoverWarmupQueue"/>.
/// По одной обложке и с паузой между ними: посетители в это время не должны замечать фоновую работу.
/// </summary>
public sealed class CoverWarmupWorker(
    CoverWarmupQueue queue,
    IServiceScopeFactory scopes,
    IConfiguration configuration,
    ILogger<CoverWarmupWorker> logger) : BackgroundService
{
    /// <summary>Пауза после обложки, у которой что-то нарезалось: отдаём процессор запросам посетителей.</summary>
    private static readonly TimeSpan PauseBetweenCovers = TimeSpan.FromMilliseconds(150);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!configuration.GetValue("Covers:Warmup", true))
        {
            return;
        }

        try
        {
            // Старт сервера и так нагружен (прогрев, миграции, Keycloak рядом) — нарезка подождёт.
            await Task.Delay(TimeSpan.FromSeconds(configuration.GetValue("Covers:WarmupDelaySeconds", 60)), stoppingToken);
            await EnqueueCatalogAsync(stoppingToken);

            var rendered = 0;
            var covers = 0;
            var started = DateTime.UtcNow;
            await foreach (var path in queue.Reader.ReadAllAsync(stoppingToken))
            {
                var count = await PrerenderAsync(path, stoppingToken);
                if (count > 0)
                {
                    rendered += count;
                    covers++;
                    await Task.Delay(PauseBetweenCovers, stoppingToken);
                }

                if (rendered > 0 && queue.Reader.CanCount && queue.Reader.Count == 0)
                {
                    logger.LogInformation("Cover warm-up: {Variants} variants for {Covers} covers in {Seconds:F0}s.",
                        rendered, covers, (DateTime.UtcNow - started).TotalSeconds);
                    rendered = 0;
                    covers = 0;
                    started = DateTime.UtcNow;
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
        catch (Exception ex)
        {
            // Фоновая нарезка — украшение: её сбой не должен останавливать сервер (по умолчанию упавший
            // BackgroundService гасит весь хост). Без неё обложки, как раньше, режутся по первому запросу.
            logger.LogError(ex, "Cover warm-up stopped; covers will be rendered on first request.");
        }
    }

    private async Task EnqueueCatalogAsync(CancellationToken ct)
    {
        try
        {
            using var scope = scopes.CreateScope();
            var catalog = scope.ServiceProvider.GetRequiredService<ICatalogSnapshotService>();
            var covers = scope.ServiceProvider.GetRequiredService<ICoverImages>();
            var paths = (await catalog.GetWithDraftsAsync())
                .Select(item => covers.NormalizeRelativePath(item.ImagePath))
                .OfType<string>()
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            foreach (var path in paths)
            {
                queue.Enqueue(path);
            }
            logger.LogInformation("Cover warm-up: checking {Count} catalog covers.", paths.Count);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Cover warm-up: could not read the catalog.");
        }
    }

    private async Task<int> PrerenderAsync(string path, CancellationToken ct)
    {
        try
        {
            using var scope = scopes.CreateScope();
            return await scope.ServiceProvider.GetRequiredService<ICoverImages>().PrerenderAsync(path, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Cover warm-up failed for {Path}.", path);
            return 0;
        }
    }
}
