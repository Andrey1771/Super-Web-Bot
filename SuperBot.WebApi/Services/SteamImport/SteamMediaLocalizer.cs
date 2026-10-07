using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using SuperBot.Core.Entities;
using SuperBot.WebApi.Services.Imaging;

namespace SuperBot.WebApi.Services.SteamImport;

public interface ISteamMediaLocalizer
{
    /// <summary>
    /// Скачивает в uploads всё, на что карточка ссылается во внешний мир (скриншоты, главный трейлер с
    /// постером, картинки описаний), и переписывает адреса на свои. Что скачать не удалось — убирается
    /// из карточки: внешних ссылок на медиа после этого в ней нет. Повторный вызов ничего не качает заново.
    /// </summary>
    Task<SteamMediaReport> LocalizeAsync(string appId, GameDetails details, CancellationToken ct);

    /// <summary>Картинка по внешнему адресу → webp в uploads (обложки новостей и т.п.). null — не удалось.</summary>
    Task<string?> LocalizeImageAsync(string url, string folder, string name, CancellationToken ct);
}

public sealed record SteamMediaReport(int Downloaded, long Bytes, int Dropped);

/// <summary>
/// Медиа игр хранятся у нас, а не ссылками на CDN Steam: магазин не зависит от того, закроет ли Valve
/// загрузку с чужих сайтов, и браузер покупателя не ходит к сторонним серверам.
///
/// Раскладка: /uploads/steam/{appid}/
///   ss-{хеш}.webp, ss-{хеш}-thumb.webp — скриншоты (1920 и 480 по длинной стороне);
///   d-{хеш}.{ext} — картинки и анимации из описаний, как есть;
///   trailer-{id}/master.m3u8 + сегменты — главный трейлер, поток HLS в двух качествах (лучшее не выше
///   720p и самое лёгкое): файлы Steam один в один, без перекодирования; poster.jpg — его постер.
/// Отдаёт всё это nginx напрямую из тома uploads (см. nginx/locations.conf).
/// </summary>
public sealed partial class SteamMediaLocalizer(
    HttpClient http,
    ICoverImages covers,
    ILogger<SteamMediaLocalizer> logger) : ISteamMediaLocalizer
{
    public const string UrlPrefix = "/uploads/steam";
    public const int MaxTrailerHeight = 720;
    private const int SegmentParallelism = 8;

    public async Task<SteamMediaReport> LocalizeAsync(string appId, GameDetails details, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(appId) || !appId.All(char.IsAsciiDigit))
        {
            throw new ArgumentException("Steam app id must be a number.", nameof(appId));
        }
        var folder = Path.Combine(covers.Root, "steam", appId);
        Directory.CreateDirectory(folder);
        var stats = new Stats();

        var gallery = new List<GameMediaItem>();
        var trailerKept = false;
        foreach (var item in details.Gallery.OrderBy(i => i.Order))
        {
            if (item.Type == "video")
            {
                // Один трейлер на игру: остальные заняли бы десятки гигабайт.
                if (trailerKept)
                {
                    stats.Dropped++;
                    continue;
                }
                if (!IsExternal(item.Url) || await LocalizeTrailerAsync(appId, folder, item, stats, ct))
                {
                    gallery.Add(item);
                    trailerKept = true;
                }
                else
                {
                    stats.Dropped++;
                }
                continue;
            }

            if (!IsExternal(item.Url))
            {
                gallery.Add(item);
                continue;
            }
            if (await LocalizeScreenshotAsync(appId, folder, item, stats, ct))
            {
                gallery.Add(item);
            }
            else
            {
                stats.Dropped++;
            }
        }
        var order = 0;
        foreach (var item in gallery)
        {
            item.Order = order++;
        }
        details.Gallery = gallery;

        details.DescriptionMarkdown = await LocalizeMarkdownAsync(appId, folder, details.DescriptionMarkdown, stats, ct);
        if (details.DescriptionMarkdownI18n is { Count: > 0 } translations)
        {
            foreach (var locale in translations.Keys.ToList())
            {
                translations[locale] = await LocalizeMarkdownAsync(appId, folder, translations[locale], stats, ct) ?? "";
            }
        }

        return new SteamMediaReport(stats.Downloaded, stats.Bytes, stats.Dropped);
    }

    public async Task<string?> LocalizeImageAsync(string url, string folder, string name, CancellationToken ct)
    {
        if (!IsExternal(url))
        {
            return url;
        }
        var directory = Path.Combine(covers.Root, folder);
        Directory.CreateDirectory(directory);
        var file = $"{name}.webp";
        var path = Path.Combine(directory, file);
        if (!File.Exists(path))
        {
            var bytes = await TryDownloadAsync(url, ct);
            if (bytes is null)
            {
                return null;
            }
            using var image = RasterImage.Decode(bytes);
            using var fitted = image.FitWithin(1920);
            await fitted.SaveWebpAsync(path, 82, ct);
        }
        return $"/uploads/{folder.Replace('\\', '/')}/{file}";
    }

    // ---- скриншоты ----

    private async Task<bool> LocalizeScreenshotAsync(string appId, string folder, GameMediaItem item, Stats stats, CancellationToken ct)
    {
        var key = StableKey(item.Url!);
        var full = Path.Combine(folder, $"ss-{key}.webp");
        var thumb = Path.Combine(folder, $"ss-{key}-thumb.webp");
        try
        {
            if (!File.Exists(full) || !File.Exists(thumb))
            {
                var bytes = await TryDownloadAsync(item.Url!, ct);
                if (bytes is null)
                {
                    return false;
                }
                using var image = RasterImage.Decode(bytes);
                using (var large = image.FitWithin(1920))
                {
                    await large.SaveWebpAsync(full, 82, ct);
                    item.Width = large.Width;
                    item.Height = large.Height;
                }
                using (var small = image.FitWithin(480))
                {
                    await small.SaveWebpAsync(thumb, 78, ct);
                }
                stats.Downloaded++;
                stats.Bytes += new FileInfo(full).Length + new FileInfo(thumb).Length;
            }
            item.Url = $"{UrlPrefix}/{appId}/ss-{key}.webp";
            item.ThumbUrl = $"{UrlPrefix}/{appId}/ss-{key}-thumb.webp";
            item.PosterUrl = null;
            return true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning("Steam app {AppId}: screenshot {Url} not saved ({Message})", appId, item.Url, ex.Message);
            TryDelete(full);
            TryDelete(thumb);
            return false;
        }
    }

    // ---- трейлер (HLS) ----

    private async Task<bool> LocalizeTrailerAsync(string appId, string folder, GameMediaItem item, Stats stats, CancellationToken ct)
    {
        var id = item.Id?.Replace("steam-movie-", "") is { Length: > 0 } movieId && movieId.All(char.IsAsciiDigit) ? movieId : StableKey(item.Url!);
        var dir = Path.Combine(folder, $"trailer-{id}");
        var masterPath = Path.Combine(dir, "master.m3u8");
        var publicBase = $"{UrlPrefix}/{appId}/trailer-{id}";
        try
        {
            if (!File.Exists(masterPath))
            {
                Directory.CreateDirectory(dir);
                var masterUrl = new Uri(item.Url!);
                var master = await RetryAsync(() => http.GetStringAsync(masterUrl, ct), ct);
                var plan = HlsPlan.Parse(master, MaxTrailerHeight);
                if (plan is null)
                {
                    return false;
                }

                // Плейлисты вариантов и аудио: сегменты лежат рядом с исходным путём, имена сохраняем.
                foreach (var playlist in plan.Playlists)
                {
                    var playlistUrl = new Uri(masterUrl, playlist);
                    var playlistPath = SafeCombine(dir, playlist);
                    // Сегменты адресуются относительно своего плейлиста — и лежат рядом с ним.
                    var playlistDir = Path.GetDirectoryName(playlistPath)!;
                    var body = await RetryAsync(() => http.GetStringAsync(playlistUrl, ct), ct);
                    var files = HlsPlan.MediaFiles(body);
                    await Parallel.ForEachAsync(files, new ParallelOptions { MaxDegreeOfParallelism = SegmentParallelism, CancellationToken = ct }, async (file, token) =>
                    {
                        var target = SafeCombine(dir, Path.GetRelativePath(dir, Path.Combine(playlistDir, file)));
                        if (File.Exists(target))
                        {
                            return;
                        }
                        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                        var bytes = await RetryAsync(() => http.GetByteArrayAsync(new Uri(playlistUrl, file), token), token);
                        await File.WriteAllBytesAsync(target + ".part", bytes, token);
                        File.Move(target + ".part", target, overwrite: true);
                        Interlocked.Add(ref stats.Bytes, bytes.Length);
                    });
                    Directory.CreateDirectory(playlistDir);
                    await File.WriteAllTextAsync(playlistPath, body, ct);
                }

                if (IsExternal(item.PosterUrl ?? item.ThumbUrl) && await TryDownloadAsync((item.PosterUrl ?? item.ThumbUrl)!, ct) is { } poster)
                {
                    await File.WriteAllBytesAsync(Path.Combine(dir, "poster.jpg"), poster, ct);
                }
                // master — последним: его наличие значит «трейлер скачан целиком».
                await File.WriteAllTextAsync(masterPath, plan.Master, ct);
                stats.Downloaded++;
            }

            item.Url = $"{publicBase}/master.m3u8";
            var posterLocal = File.Exists(Path.Combine(dir, "poster.jpg")) ? $"{publicBase}/poster.jpg" : null;
            item.PosterUrl = posterLocal;
            item.ThumbUrl = posterLocal;
            return true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning("Steam app {AppId}: trailer {Url} not saved ({Message})", appId, item.Url, ex.Message);
            try { Directory.Delete(dir, recursive: true); } catch { /* недокачанное уберём при следующем запуске */ }
            return false;
        }
    }

    // ---- картинки описаний ----

    private async Task<string?> LocalizeMarkdownAsync(string appId, string folder, string? markdown, Stats stats, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(markdown))
        {
            return markdown;
        }
        var replacements = new Dictionary<string, string?>();
        foreach (Match match in MarkdownImage().Matches(markdown))
        {
            var url = match.Groups["url"].Value;
            if (!IsExternal(url) || replacements.ContainsKey(url))
            {
                continue;
            }
            var extension = ImageExtension(url);
            var file = $"d-{StableKey(url)}{extension}";
            var path = Path.Combine(folder, file);
            if (!File.Exists(path))
            {
                var bytes = await TryDownloadAsync(url, ct);
                if (bytes is not null)
                {
                    await File.WriteAllBytesAsync(path, bytes, ct);
                    stats.Downloaded++;
                    stats.Bytes += bytes.Length;
                }
            }
            replacements[url] = File.Exists(path) ? $"{UrlPrefix}/{appId}/{file}" : null;
        }

        var result = MarkdownImage().Replace(markdown, match =>
        {
            var url = match.Groups["url"].Value;
            if (!replacements.TryGetValue(url, out var local))
            {
                return match.Value;
            }
            if (local is null)
            {
                stats.Dropped++;
                return "";
            }
            return $"![{match.Groups["alt"].Value}]({local})";
        });
        return MultipleBlankLines().Replace(result, "\n\n").Trim();
    }

    // ---- общее ----

    /// <summary>
    /// Повтор при сетевом сбое. CDN Steam временами рвёт TLS-соединения волнами по минуте; без
    /// повтора один такой обрыв на любом из сотни сегментов ронял весь трейлер.
    /// </summary>
    private static async Task<T> RetryAsync<T>(Func<Task<T>> action, CancellationToken ct)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                return await action();
            }
            catch (HttpRequestException) when (attempt < 5)
            {
                await Task.Delay(TimeSpan.FromSeconds(attempt * attempt * 2), ct);
            }
        }
    }

    private async Task<byte[]?> TryDownloadAsync(string url, CancellationToken ct)
    {
        for (var attempt = 1; attempt <= 3; attempt++)
        {
            try
            {
                using var response = await http.GetAsync(url, ct);
                if (!response.IsSuccessStatusCode)
                {
                    return null;
                }
                return await response.Content.ReadAsByteArrayAsync(ct);
            }
            catch (HttpRequestException) when (attempt < 3)
            {
                await Task.Delay(TimeSpan.FromSeconds(attempt * 2), ct);
            }
            catch (HttpRequestException ex)
            {
                logger.LogWarning("Download {Url} failed: {Message}", url, ex.Message);
                return null;
            }
        }
        return null;
    }

    public static bool IsExternal(string? url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);

    /// <summary>Короткий стабильный ключ файла по адресу без параметров (?t=… у Steam меняется).</summary>
    public static string StableKey(string url)
    {
        var path = Uri.TryCreate(url, UriKind.Absolute, out var uri) ? uri.GetLeftPart(UriPartial.Path) : url;
        return Convert.ToHexStringLower(SHA1.HashData(Encoding.UTF8.GetBytes(path)))[..12];
    }

    private static string ImageExtension(string url)
    {
        var path = Uri.TryCreate(url, UriKind.Absolute, out var uri) ? uri.AbsolutePath : url;
        var extension = Path.GetExtension(path).ToLowerInvariant();
        return extension is ".jpg" or ".jpeg" or ".png" or ".gif" or ".webp" or ".avif" ? extension : ".jpg";
    }

    /// <summary>Путь сегмента из плейлиста — только внутри папки трейлера (никаких «../»).</summary>
    private static string SafeCombine(string root, string relative)
    {
        var full = Path.GetFullPath(Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar)));
        var rootFull = Path.GetFullPath(root) + Path.DirectorySeparatorChar;
        if (!full.StartsWith(rootFull, StringComparison.Ordinal))
        {
            throw new InvalidOperationException($"Playlist entry escapes the trailer folder: {relative}");
        }
        return full;
    }

    private static void TryDelete(string path)
    {
        try { File.Delete(path); } catch { /* нет файла — и ладно */ }
    }

    private sealed class Stats
    {
        public int Downloaded;
        public long Bytes;
        public int Dropped;
    }

    [GeneratedRegex(@"!\[(?<alt>[^\]]*)\]\((?<url>[^)\s]+)\)")]
    private static partial Regex MarkdownImage();

    [GeneratedRegex(@"\n{3,}")]
    private static partial Regex MultipleBlankLines();
}

/// <summary>
/// Разбор master-плейлиста трейлера Steam: какие варианты оставить и новый master только с ними.
/// Оставляем лучший вариант не выше maxHeight и самый лёгкий (если он другой) — выбор качества в
/// плеере сохраняется, а места нужно втрое меньше, чем под все варианты.
/// </summary>
public sealed partial record HlsPlan(string Master, IReadOnlyList<string> Playlists)
{
    public static HlsPlan? Parse(string master, int maxHeight)
    {
        var lines = master.Replace("\r", "").Split('\n');
        var variants = new List<(int Height, string Info, string Uri)>();
        for (var i = 0; i < lines.Length - 1; i++)
        {
            if (!lines[i].StartsWith("#EXT-X-STREAM-INF", StringComparison.Ordinal))
            {
                continue;
            }
            var height = Resolution().Match(lines[i]) is { Success: true } m ? int.Parse(m.Groups[1].Value) : 0;
            var uri = lines[i + 1].Trim();
            if (uri.Length > 0 && !uri.StartsWith('#'))
            {
                variants.Add((height, lines[i], uri));
            }
        }
        if (variants.Count == 0)
        {
            return null;
        }

        var fitting = variants.Where(v => v.Height > 0 && v.Height <= maxHeight).OrderByDescending(v => v.Height).ToList();
        var best = fitting.Count > 0 ? fitting[0] : variants.OrderBy(v => v.Height).First();
        var lightest = variants.Where(v => v.Height > 0).OrderBy(v => v.Height).FirstOrDefault();
        var keep = new List<(int Height, string Info, string Uri)> { best };
        if (lightest.Uri is not null && lightest.Uri != best.Uri)
        {
            keep.Add(lightest);
        }

        var playlists = new List<string>();
        var output = new StringBuilder();
        foreach (var line in lines)
        {
            if (line.StartsWith("#EXT-X-STREAM-INF", StringComparison.Ordinal) || line.Length == 0)
            {
                continue;
            }
            if (!line.StartsWith('#'))
            {
                continue;
            }
            if (line.StartsWith("#EXT-X-MEDIA", StringComparison.Ordinal) && MediaUri().Match(line) is { Success: true } media)
            {
                playlists.Add(media.Groups[1].Value);
            }
            output.Append(line).Append('\n');
        }
        foreach (var variant in keep)
        {
            output.Append(variant.Info).Append('\n').Append(variant.Uri).Append('\n');
            playlists.Add(variant.Uri);
        }
        return new HlsPlan(output.ToString(), playlists);
    }

    /// <summary>Файлы, на которые ссылается медиа-плейлист: init-сегмент (EXT-X-MAP) и сами сегменты.</summary>
    public static IReadOnlyList<string> MediaFiles(string playlist)
    {
        var files = new List<string>();
        foreach (var raw in playlist.Replace("\r", "").Split('\n'))
        {
            var line = raw.Trim();
            if (line.StartsWith("#EXT-X-MAP", StringComparison.Ordinal) && MapUri().Match(line) is { Success: true } map)
            {
                files.Add(map.Groups[1].Value);
            }
            else if (line.Length > 0 && !line.StartsWith('#'))
            {
                files.Add(line);
            }
        }
        return files.Distinct().ToList();
    }

    [GeneratedRegex(@"RESOLUTION=\d+x(\d+)")]
    private static partial Regex Resolution();

    [GeneratedRegex(@"URI=""([^""]+)""")]
    private static partial Regex MediaUri();

    [GeneratedRegex(@"URI=""([^""]+)""")]
    private static partial Regex MapUri();
}
