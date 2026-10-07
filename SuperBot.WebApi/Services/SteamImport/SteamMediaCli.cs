using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Services.SteamImport;

/// <summary>
/// Перенос медиа уже заведённых игр и обложек новостей к себе (см. SteamMediaLocalizer):
///
///   docker compose run --rm --no-deps backend localize-media            — все игры из Steam и блог
///   docker compose run --rm --no-deps backend localize-media 1091500,620 — выбранные игры
///
/// Запросов к API Steam нет — качаются только файлы по адресам из карточек, поэтому идёт быстро и
/// без лимита. Повторный запуск докачивает то, что не скачалось, остальное пропускает.
/// </summary>
public static class SteamMediaCli
{
    public const string Command = "localize-media";
    private const int GameParallelism = 4;

    public static async Task<int> RunAsync(IServiceProvider services, string[] args)
    {
        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger("SteamMediaCli");
        var only = args.FirstOrDefault(a => !a.StartsWith("--", StringComparison.Ordinal)) is { } list
            ? SuperBot.WebApi.Controllers.AdminSteamImportController.ParseAppIds(list.Replace(',', '\n')).ToHashSet()
            : null;

        List<SuperBot.Core.Entities.Game> games;
        using (var scope = services.CreateScope())
        {
            games = (await scope.ServiceProvider.GetRequiredService<IGameRepository>().GetAllAsync())
                .Where(g => g.ExternalId?.StartsWith("steam-", StringComparison.Ordinal) == true)
                .Where(g => only is null || only.Contains(g.ExternalId!["steam-".Length..]))
                .ToList();
        }
        logger.LogInformation("Localizing media of {Count} games", games.Count);

        var done = 0;
        long bytes = 0;
        var dropped = 0;
        var failed = 0;
        await Parallel.ForEachAsync(games, new ParallelOptions { MaxDegreeOfParallelism = GameParallelism }, async (game, ct) =>
        {
            using var scope = services.CreateScope();
            var details = scope.ServiceProvider.GetRequiredService<IGameDetailsRepository>();
            var localizer = scope.ServiceProvider.GetRequiredService<ISteamMediaLocalizer>();
            var appId = game.ExternalId!["steam-".Length..];
            try
            {
                var card = await details.GetByGameIdAsync(game.Id!);
                if (card is null)
                {
                    return;
                }
                var report = await localizer.LocalizeAsync(appId, card, ct);
                await details.UpsertAsync(card);
                Interlocked.Add(ref bytes, report.Bytes);
                Interlocked.Add(ref dropped, report.Dropped);
                var n = Interlocked.Increment(ref done);
                if (n % 25 == 0 || n == games.Count)
                {
                    logger.LogInformation("{Done}/{Total} games, {Size} MB downloaded", n, games.Count, Interlocked.Read(ref bytes) / 1_048_576);
                }
            }
            catch (Exception ex)
            {
                Interlocked.Increment(ref failed);
                logger.LogError(ex, "Media of {Game} ({AppId}) not localized", game.Name, appId);
            }
        });

        // Обложки новостей: арт игр по ссылкам Steam → webp в uploads/blog.
        var blogMoved = 0;
        if (only is null)
        {
            using var scope = services.CreateScope();
            var database = scope.ServiceProvider.GetRequiredService<IMongoDatabase>();
            var localizer = scope.ServiceProvider.GetRequiredService<ISteamMediaLocalizer>();
            var posts = database.GetCollection<BsonDocument>("BlogPosts");
            var external = await posts.Find(Builders<BsonDocument>.Filter.Regex("coverUrl", new BsonRegularExpression("^https?://"))).ToListAsync();
            foreach (var post in external)
            {
                var slug = post.GetValue("slug", "").AsString;
                var local = await localizer.LocalizeImageAsync(post["coverUrl"].AsString, "blog", string.IsNullOrEmpty(slug) ? post["_id"].ToString()! : slug, CancellationToken.None);
                await posts.UpdateOneAsync(Builders<BsonDocument>.Filter.Eq("_id", post["_id"]),
                    local is null ? Builders<BsonDocument>.Update.Set("coverUrl", BsonNull.Value) : Builders<BsonDocument>.Update.Set("coverUrl", local));
                blogMoved++;
            }
        }

        services.GetRequiredService<ICatalogSnapshotService>().Invalidate();
        logger.LogInformation("Done: {Games} games, {Size} MB, {Dropped} items without a copy removed, {Failed} failed, {Blog} blog covers",
            done, bytes / 1_048_576, dropped, failed, blogMoved);
        return failed == 0 ? 0 : 1;
    }
}
