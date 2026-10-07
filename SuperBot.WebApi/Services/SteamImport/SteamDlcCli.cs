using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Services.SteamImport;

/// <summary>
/// DLC к играм каталога — из консоли сервера:
///
///   docker compose run --rm --no-deps backend import-dlc all                  — DLC всех игр из Steam
///   docker compose run --rm --no-deps backend import-dlc 268500,1091500       — только этих игр (appid базовой)
///   ... [--min-price 10] [--with-trailers] [--update]
///
/// Список DLC игры — один запрос dlcforapp; дальше каждое DLC заводится тем же импортёром, что и игры,
/// отдельным товаром с ParentGameId базовой игры. Бесплатные DLC не берём (ключ на них не продают),
/// --min-price отсекает дешёвые (косметику, песни, саундтреки). Трейлеры DLC по умолчанию не качаются:
/// ролик весит ~40 МБ, а у DLC он — нарезка из трейлера самой игры.
///
/// Повторный запуск продолжает с места остановки: уже заведённые DLC пропускаются без запросов к Steam.
/// В пределах игры DLC идут от дорогих к дешёвым — прерванный импорт успевает завести главные дополнения.
/// </summary>
public static class SteamDlcCli
{
    public const string Command = "import-dlc";

    /// <summary>
    /// Сколько DLC заводится одновременно (--parallel). Запросы к API Steam всё равно идут по одному (очередь
    /// клиента), а потоки нужны, чтобы она не простаивала: трейлер — сотня кусков видео, и при трёх потоках
    /// бывало, что все три качали ролики, а очередь к Steam стояла пустой по 5–20 секунд.
    /// </summary>
    private const int DefaultParallelism = 6;

    public sealed record DlcTask(Game Parent, IReadOnlySet<string> Family, SteamDlcListing Dlc);

    public static async Task<int> RunAsync(IServiceProvider services, string[] args)
    {
        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger("SteamDlcCli");
        var source = args.FirstOrDefault(a => !a.StartsWith("--", StringComparison.Ordinal));
        if (string.IsNullOrWhiteSpace(source))
        {
            Console.Error.WriteLine($"Usage: {Command} all|<base game app ids> [--min-price <usd>] [--with-trailers] [--update] [--parallel <n>]");
            return 2;
        }
        var only = source == "all"
            ? null
            : SuperBot.WebApi.Controllers.AdminSteamImportController.ParseAppIds(source.Replace(',', '\n')).ToHashSet();
        var minPriceCents = ReadMinPriceCents(args);
        var parallelism = ReadInt(args, "--parallel") is { } p and > 0 ? p : DefaultParallelism;
        var options = new SteamImportOptions
        {
            UpdateExisting = args.Contains("--update"),
            IncludeTrailers = args.Contains("--with-trailers"),
        };

        List<Game> parents;
        using (var scope = services.CreateScope())
        {
            parents = (await scope.ServiceProvider.GetRequiredService<IGameRepository>().GetAllAsync())
                .Where(g => g.ExternalId?.StartsWith("steam-", StringComparison.Ordinal) == true && string.IsNullOrWhiteSpace(g.ParentGameId))
                .Where(g => only is null || only.Contains(g.ExternalId!["steam-".Length..]))
                .OrderBy(g => g.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }
        logger.LogInformation("DLC import for {Count} games, min price {MinPrice} cents, trailers: {Trailers}", parents.Count, minPriceCents, options.IncludeTrailers);

        var steam = services.GetRequiredService<ISteamStoreClient>();
        var counts = new Dictionary<SteamImportOutcome, int>();
        var gate = new object();

        // Одна общая очередь DLC через все игры: потоки берут следующее DLC, как только освободились, и не ждут,
        // пока доделается предыдущая игра (у игры с одним DLC раньше работал один поток из трёх).
        async IAsyncEnumerable<DlcTask> AllTasks()
        {
            var index = 0;
            // Одно DLC — одна задача. Steam иногда перечисляет DLC дважды (или у двух игр), и две параллельные
            // задачи обе не находили его в каталоге и обе заводили: так появились дубли с одним steam-id.
            var queued = new HashSet<string>(StringComparer.Ordinal);
            foreach (var parent in parents)
            {
                index++;
                var parentAppId = parent.ExternalId!["steam-".Length..];
                var listing = await steam.GetDlcListAsync(parentAppId, CancellationToken.None);
                if (listing is null)
                {
                    logger.LogWarning("[{Index}/{Total}] {Game}: Steam did not return the DLC list", index, parents.Count, parent.Name);
                    continue;
                }
                var family = listing.Select(d => d.AppId).Append(parentAppId).ToHashSet(StringComparer.Ordinal);
                var picked = Pick(listing, minPriceCents);
                logger.LogInformation("[{Index}/{Total}] {Game}: {Picked} of {All} DLC", index, parents.Count, parent.Name, picked.Count, listing.Count);
                foreach (var dlc in picked.Where(d => queued.Add(d.AppId)))
                {
                    yield return new DlcTask(parent, family, dlc);
                }
            }
        }

        await Parallel.ForEachAsync(AllTasks(), new ParallelOptions { MaxDegreeOfParallelism = parallelism }, async (task, ct) =>
        {
            using var scope = services.CreateScope();
            var importer = scope.ServiceProvider.GetRequiredService<ISteamCatalogImporter>();
            var result = await importer.ImportAsync(task.Dlc.AppId, options with { ParentGameId = task.Parent.Id, ParentFamilyAppIds = task.Family }, ct);
            lock (gate)
            {
                counts[result.Outcome] = counts.GetValueOrDefault(result.Outcome) + 1;
            }
            if (result.Outcome is SteamImportOutcome.Failed or SteamImportOutcome.Skipped && result.Reason != SteamCatalogImporter.AlreadyInCatalog)
            {
                logger.LogInformation("  {Outcome} {AppId} {Name}: {Reason}", result.Outcome, task.Dlc.AppId, result.Name ?? task.Dlc.Name, result.Reason);
            }
        });

        logger.LogInformation("DLC import finished: {Counts}", string.Join(", ", counts.Select(c => $"{c.Key} {c.Value}")));
        return counts.GetValueOrDefault(SteamImportOutcome.Failed) == 0 ? 0 : 1;
    }

    /// <summary>Что из списка DLC заводить: платное в долларах, не дешевле порога; дорогое — первым.</summary>
    public static IReadOnlyList<SteamDlcListing> Pick(IEnumerable<SteamDlcListing> listing, int minPriceCents) =>
        listing
            .Where(d => d.PriceInitialCents is > 0 && d.PriceInitialCents >= minPriceCents
                && string.Equals(d.Currency, "USD", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(d => d.PriceInitialCents)
            .ThenBy(d => d.AppId, StringComparer.Ordinal)
            .ToList();

    private static int? ReadInt(string[] args, string name)
    {
        var at = Array.IndexOf(args, name);
        return at >= 0 && at + 1 < args.Length && int.TryParse(args[at + 1], out var value) ? value : null;
    }

    private static int ReadMinPriceCents(string[] args)
    {
        var at = Array.IndexOf(args, "--min-price");
        return at >= 0 && at + 1 < args.Length && decimal.TryParse(args[at + 1], System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var usd)
            ? (int)Math.Round(usd * 100m)
            : 1;
    }
}
