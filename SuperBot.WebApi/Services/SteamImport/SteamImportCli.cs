using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Services.SteamImport;

/// <summary>
/// Импорт из Steam без админки — из консоли сервера, тем же механизмом и с тем же журналом:
///
///   docker compose run --rm --no-deps backend import-steam starter [--update] [--refresh-prices] [--refresh-covers]
///   docker compose run --rm --no-deps backend import-steam 1091500,292030 --update
///
/// «starter» — стартовый каталог из сборки (около 550 игр). Задача видна и на странице Steam import
/// в админке. Импорт долгий (лимит Steam), поэтому для большого списка удобнее запускать с -d
/// и смотреть docker compose logs -f.
/// </summary>
public static class SteamImportCli
{
    public const string Command = "import-steam";

    public static async Task<int> RunAsync(IServiceProvider services, string[] args)
    {
        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger("SteamImportCli");
        var source = args.FirstOrDefault(a => !a.StartsWith("--", StringComparison.Ordinal));
        if (string.IsNullOrWhiteSpace(source))
        {
            Console.Error.WriteLine($"Usage: {Command} starter|<app ids or file> [--update] [--refresh-prices] [--refresh-covers]");
            return 2;
        }

        string text;
        if (source == "starter")
        {
            await using var stream = typeof(SteamImportCli).Assembly.GetManifestResourceStream("SteamImport.starter-catalog.txt")
                ?? throw new InvalidOperationException("Starter catalog is not embedded in this build.");
            using var reader = new StreamReader(stream);
            text = await reader.ReadToEndAsync();
        }
        else
        {
            text = File.Exists(source) ? await File.ReadAllTextAsync(source) : source.Replace(',', '\n');
        }

        var appIds = SuperBot.WebApi.Controllers.AdminSteamImportController.ParseAppIds(text);
        if (appIds.Count == 0)
        {
            Console.Error.WriteLine("No Steam app ids found.");
            return 2;
        }

        var update = args.Contains("--update");
        var options = new SteamImportOptions
        {
            UpdateExisting = update,
            RefreshPrices = update && args.Contains("--refresh-prices"),
            RefreshCovers = update && args.Contains("--refresh-covers"),
        };

        using var scope = services.CreateScope();
        var jobs = scope.ServiceProvider.GetRequiredService<IImportJobRepository>();
        var job = new ImportJob
        {
            UserId = "cli",
            UserName = "console",
            StartedAt = DateTime.UtcNow,
            Status = $"queued 0/{appIds.Count}",
            Includes = [SteamImportWorker.JobKind],
        };
        await jobs.CreateAsync(job);

        logger.LogInformation("Steam import {JobId}: {Count} games, update existing: {Update}", job.Id, appIds.Count, update);
        var worker = services.GetRequiredService<SteamImportWorker>();
        await worker.RunAsync(new SteamImportRequest(job.Id, appIds, options), CancellationToken.None);

        var finished = await jobs.GetByIdAsync(job.Id);
        return finished?.Status == "completed" ? 0 : 1;
    }
}
