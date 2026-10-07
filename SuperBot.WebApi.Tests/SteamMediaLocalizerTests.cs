using System.Net;
using Microsoft.Extensions.Logging.Abstractions;
using SkiaSharp;
using SuperBot.Core.Entities;
using SuperBot.WebApi.Services;
using SuperBot.WebApi.Services.SteamImport;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Перенос медиа игры к себе: после него в карточке нет ни одной ссылки на CDN Steam — что скачалось,
/// лежит в uploads, что нет — убрано. Сеть подменена: ответы Steam — из словаря.
/// </summary>
public class SteamMediaLocalizerTests : IDisposable
{
    private const string Cdn = "https://cdn.example/apps/620/";
    private const string Video = "https://video.example/trailers/620/";

    private readonly string _root = Path.Combine(Path.GetTempPath(), "taleshop-media-" + Guid.NewGuid().ToString("N"));
    private readonly Dictionary<string, byte[]> _responses = new();
    private readonly List<string> _requested = new();

    public SteamMediaLocalizerTests()
    {
        _responses[Cdn + "ss_1.1920x1080.jpg"] = Png(1920, 1080);
        _responses[Cdn + "anim.gif"] = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
        _responses[Cdn + "movie_600x337.jpg"] = Png(600, 337);
        _responses[Video + "master.m3u8"] = Text("""
            #EXTM3U
            #EXT-X-VERSION:7
            #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Default",DEFAULT=YES,URI="a.m3u8"
            #EXT-X-STREAM-INF:BANDWIDTH=5800000,RESOLUTION=1920x1080,AUDIO="audio"
            v0.m3u8
            #EXT-X-STREAM-INF:BANDWIDTH=2600000,RESOLUTION=1280x720,AUDIO="audio"
            v1.m3u8
            #EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=640x360,AUDIO="audio"
            v3.m3u8
            """);
        foreach (var (playlist, stream) in new[] { ("a.m3u8", 4), ("v1.m3u8", 1), ("v3.m3u8", 3) })
        {
            _responses[Video + playlist] = Text($"""
                #EXTM3U
                #EXT-X-MAP:URI="dash/init-{stream}.m4s"
                #EXTINF:3
                dash/chunk-{stream}-1.m4s
                #EXTINF:3
                dash/chunk-{stream}-2.m4s
                #EXT-X-ENDLIST
                """);
            _responses[$"{Video}dash/init-{stream}.m4s"] = [1, 2, 3];
            _responses[$"{Video}dash/chunk-{stream}-1.m4s"] = [4, 5];
            _responses[$"{Video}dash/chunk-{stream}-2.m4s"] = [6, 7];
        }
    }

    public void Dispose()
    {
        try { Directory.Delete(_root, recursive: true); } catch { /* временная папка */ }
    }

    [Fact]
    public async Task Everything_lands_in_uploads_and_no_steam_links_remain()
    {
        var details = new GameDetails
        {
            Gallery =
            [
                new GameMediaItem { Id = "steam-movie-42", Type = "video", Url = Video + "master.m3u8", PosterUrl = Cdn + "movie_600x337.jpg", ThumbUrl = Cdn + "movie_600x337.jpg", IsTrailer = true, Order = 0 },
                new GameMediaItem { Id = "steam-movie-43", Type = "video", Url = Video + "second.m3u8", IsTrailer = true, Order = 1 },
                new GameMediaItem { Id = "steam-screenshot-0", Type = "image", Url = Cdn + "ss_1.1920x1080.jpg?t=1", ThumbUrl = Cdn + "ss_1.600x338.jpg", Order = 2 },
                new GameMediaItem { Id = "steam-screenshot-1", Type = "image", Url = Cdn + "missing.jpg", Order = 3 },
            ],
            DescriptionMarkdown = $"Intro.\n\n![]({Cdn}anim.gif)\n\n![]({Cdn}gone.gif)\n\nOutro.",
            DescriptionMarkdownI18n = new Dictionary<string, string> { ["ru"] = $"Вступление.\n\n![]({Cdn}anim.gif)" },
        };

        var report = await Localizer().LocalizeAsync("620", details, CancellationToken.None);

        // Второй трейлер не качается вовсе (один на игру), недоступный скриншот и картинка — убраны.
        Assert.Equal(["video", "image"], details.Gallery.Select(g => g.Type));
        Assert.Equal([0, 1], details.Gallery.Select(g => g.Order));
        Assert.DoesNotContain(_requested, url => url.Contains("second.m3u8"));
        Assert.Equal(3, report.Dropped);

        var trailer = details.Gallery[0];
        Assert.Equal("/uploads/steam/620/trailer-42/master.m3u8", trailer.Url);
        Assert.Equal("/uploads/steam/620/trailer-42/poster.jpg", trailer.PosterUrl);
        var master = File.ReadAllText(Path.Combine(_root, "steam", "620", "trailer-42", "master.m3u8"));
        // 720p и самый лёгкий вариант (360p); 1080p не берём.
        Assert.Contains("v1.m3u8", master);
        Assert.Contains("v3.m3u8", master);
        Assert.DoesNotContain("v0.m3u8", master);
        Assert.DoesNotContain(_requested, url => url.EndsWith("v0.m3u8"));
        Assert.True(File.Exists(Path.Combine(_root, "steam", "620", "trailer-42", "dash", "chunk-4-2.m4s")), "audio segment");
        Assert.True(File.Exists(Path.Combine(_root, "steam", "620", "trailer-42", "dash", "init-3.m4s")), "init segment");

        var shot = details.Gallery[1];
        Assert.StartsWith("/uploads/steam/620/ss-", shot.Url);
        Assert.EndsWith(".webp", shot.Url);
        Assert.EndsWith("-thumb.webp", shot.ThumbUrl);
        Assert.True(File.Exists(Path.Combine(_root, shot.Url!.Replace("/uploads/", "").Replace('/', Path.DirectorySeparatorChar))));

        Assert.DoesNotContain("cdn.example", details.DescriptionMarkdown);
        Assert.Contains("![](/uploads/steam/620/d-", details.DescriptionMarkdown);
        Assert.Contains("Outro.", details.DescriptionMarkdown);
        Assert.DoesNotContain("cdn.example", details.DescriptionMarkdownI18n!["ru"]);
    }

    [Fact]
    public async Task Second_run_downloads_nothing()
    {
        GameDetails Card() => new()
        {
            Gallery = [new GameMediaItem { Type = "image", Url = Cdn + "ss_1.1920x1080.jpg" }],
            DescriptionMarkdown = $"![]({Cdn}anim.gif)",
        };
        await Localizer().LocalizeAsync("620", Card(), CancellationToken.None);
        _requested.Clear();

        var again = Card();
        var report = await Localizer().LocalizeAsync("620", again, CancellationToken.None);

        Assert.Empty(_requested);
        Assert.Equal(0, report.Downloaded);
        Assert.StartsWith("/uploads/steam/620/", again.Gallery[0].Url);
    }

    [Fact]
    public void Plan_keeps_best_up_to_720p_and_the_lightest()
    {
        const string master = """
            #EXTM3U
            #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="a.m3u8"
            #EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=700x394
            v0.m3u8
            #EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=640x360
            v1.m3u8
            """;

        var plan = HlsPlan.Parse(master, 720)!;

        // Трейлер без 720p: лучший — 394p, лёгкий — 360p.
        Assert.Equal(["a.m3u8", "v0.m3u8", "v1.m3u8"], plan.Playlists);
        Assert.StartsWith("#EXTM3U", plan.Master);
    }

    private SteamMediaLocalizer Localizer() =>
        new(new HttpClient(new FakeHandler(_responses, _requested)), new FakeCovers(_root), NullLogger<SteamMediaLocalizer>.Instance);

    private static byte[] Png(int width, int height)
    {
        using var bitmap = new SKBitmap(width, height);
        bitmap.Erase(SKColors.SteelBlue);
        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Png, 100);
        return data.ToArray();
    }

    private static byte[] Text(string value) => System.Text.Encoding.UTF8.GetBytes(value.Replace("\r", ""));

    private sealed class FakeHandler(Dictionary<string, byte[]> responses, List<string> requested) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var url = request.RequestUri!.GetLeftPart(UriPartial.Path);
            lock (requested) requested.Add(url);
            return Task.FromResult(responses.TryGetValue(url, out var body)
                ? new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(body) }
                : new HttpResponseMessage(HttpStatusCode.NotFound));
        }
    }

    private sealed class FakeCovers(string root) : ICoverImages
    {
        public string Root => root;
        public Task<string?> GetVariantPathAsync(string relativePath, int width, string ratio, CancellationToken ct) => throw new NotSupportedException();
        public Task<CoverPreparation> PrepareUploadAsync(string physicalPath, string relativePath, CancellationToken ct) => throw new NotSupportedException();
        public Task<CoverImageMeta?> GetMetaAsync(string relativePath, CancellationToken ct) => throw new NotSupportedException();
        public Task<CoverImageMeta?> SetFocusAsync(string relativePath, double focusX, double focusY, CancellationToken ct) => throw new NotSupportedException();
        public string? NormalizeRelativePath(string? pathOrUrl) => throw new NotSupportedException();
    }
}
