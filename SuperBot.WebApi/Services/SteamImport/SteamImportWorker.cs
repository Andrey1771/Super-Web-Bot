using System.Threading.Channels;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Services.SteamImport;

public sealed record SteamImportRequest(string JobId, IReadOnlyList<string> AppIds, SteamImportOptions Options);

public interface ISteamImportQueue
{
    bool TryEnqueue(SteamImportRequest request);
}

/// <summary>
/// Импорт из Steam идёт фоном: лимит Steam — около 200 запросов за 5 минут, а на игру их нужно
/// четыре (английский и три перевода), так что 500 игр — это полтора-два часа. Ход пишется в
/// журнал импорта (ImportJobs) после каждой игры: админка показывает прогресс, а при перезапуске
/// сервиса видно, на чём остановились. Повторный запуск того же списка пропустит уже заведённые.
///
/// Задачи — по одной за раз: две параллельные делили бы один лимит Steam и шли бы не быстрее.
/// </summary>
public sealed class SteamImportWorker(IServiceScopeFactory scopes, ILogger<SteamImportWorker> logger) : BackgroundService, ISteamImportQueue
{
    public const string JobKind = "steam";
    private readonly Channel<SteamImportRequest> _queue = Channel.CreateUnbounded<SteamImportRequest>();

    public bool TryEnqueue(SteamImportRequest request) => _queue.Writer.TryWrite(request);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var request in _queue.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                await RunAsync(request, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                await MarkAsync(request.JobId, "interrupted", CancellationToken.None);
                return;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Steam import job {JobId} failed", request.JobId);
                await MarkAsync(request.JobId, "failed", CancellationToken.None);
            }
        }
    }

    /// <summary>Выполнить задачу сейчас, в этом потоке (очередь не нужна: так её запускает и консольная команда).</summary>
    public async Task RunAsync(SteamImportRequest request, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var jobs = scope.ServiceProvider.GetRequiredService<IImportJobRepository>();
        var importer = scope.ServiceProvider.GetRequiredService<ISteamCatalogImporter>();
        var snapshot = scope.ServiceProvider.GetRequiredService<ICatalogSnapshotService>();

        var job = await jobs.GetByIdAsync(request.JobId);
        if (job is null)
        {
            return;
        }
        logger.LogInformation("Steam import {JobId}: {Count} apps", request.JobId, request.AppIds.Count);

        var done = 0;
        foreach (var appId in request.AppIds)
        {
            var result = await importer.ImportAsync(appId, request.Options, ct);
            done++;
            switch (result.Outcome)
            {
                case SteamImportOutcome.Created:
                    job.Stats.GamesCreated++;
                    job.Stats.MediaCreated++;
                    break;
                case SteamImportOutcome.Updated:
                    job.Stats.GamesUpdated++;
                    break;
                case SteamImportOutcome.Skipped:
                    job.Stats.GamesSkipped++;
                    job.Warnings.Add(new ImportIssue { Code = "skipped", Path = appId, Message = $"{result.Name ?? appId}: {result.Reason}" });
                    break;
                default:
                    job.Errors.Add(new ImportIssue { Code = "failed", Path = appId, Message = result.Reason ?? "unknown error" });
                    break;
            }
            // Витрина видит новые игры по ходу импорта, а не через два часа.
            if (result.Outcome is SteamImportOutcome.Created or SteamImportOutcome.Updated && done % 10 == 0)
            {
                snapshot.Invalidate();
            }
            job.Status = $"running {done}/{request.AppIds.Count}";
            await jobs.UpdateAsync(job);
        }

        job.Status = job.Errors.Count > 0 && job.Stats.GamesCreated + job.Stats.GamesUpdated == 0 ? "failed" : "completed";
        job.FinishedAt = DateTime.UtcNow;
        await jobs.UpdateAsync(job);
        snapshot.Invalidate();
        scope.ServiceProvider.GetRequiredService<IGameGenreDirectory>().Invalidate();
        logger.LogInformation("Steam import {JobId} finished: {Created} created, {Updated} updated, {Skipped} skipped, {Failed} failed",
            request.JobId, job.Stats.GamesCreated, job.Stats.GamesUpdated, job.Stats.GamesSkipped, job.Errors.Count);
    }

    private async Task MarkAsync(string jobId, string status, CancellationToken ct)
    {
        try
        {
            using var scope = scopes.CreateScope();
            var jobs = scope.ServiceProvider.GetRequiredService<IImportJobRepository>();
            var job = await jobs.GetByIdAsync(jobId);
            if (job is null) return;
            job.Status = status;
            job.FinishedAt = DateTime.UtcNow;
            await jobs.UpdateAsync(job);
        }
        catch (Exception ex)
        {
            logger.LogWarning("Could not mark Steam import {JobId} as {Status}: {Message}", jobId, status, ex.Message);
        }
    }
}
