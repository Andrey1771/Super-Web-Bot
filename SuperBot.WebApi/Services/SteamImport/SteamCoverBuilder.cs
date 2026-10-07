using SkiaSharp;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Services.Imaging;

namespace SuperBot.WebApi.Services.SteamImport;

public interface ISteamCoverBuilder
{
    /// <summary>
    /// Обложка игры в медиатеке магазина: картинка скачивается с CDN Steam, проходит обычную проверку
    /// обложек (CoverImages) и регистрируется как MediaAsset. Возвращает адрес вида /uploads/images/…
    /// или null, если у игры нет подходящей картинки.
    /// </summary>
    Task<string?> BuildAsync(string appId, string gameName, CancellationToken ct);
}

/// <summary>
/// Витрина режет одну обложку под разные рамки: квадрат в каталоге, 3:4 в «сделке недели», 16:9
/// в баннерах. Ни одна картинка Steam под это не подходит: шапка (460×215) мала, вертикальная
/// коробка теряет логотип в широкой рамке, горизонтальная капсула — в вертикальной.
///
/// Поэтому обложка собирается так же, как Steam рисует библиотеку: фоновый арт игры (library_hero)
/// на весь кадр 4:3 и официальный логотип (logo.png) по центру. Центр кадра попадает в любую рамку,
/// и логотип виден везде. Логотип отдельным файлом есть не у всех: у новых игр Steam прячет его в
/// папку с хешем и не сообщает адрес. Тогда обложка — тот же арт на весь кадр, без логотипа: название
/// игры витрина и так пишет под картинкой. Нет и арта — капсула магазина на весь кадр, потом
/// вертикальная коробка. (Капсула «в раме» на размытом фоне выглядела мелкой картинкой в окошке.)
/// Адреса артов — из IStoreBrowseService, по угаданным путям остаются только старые игры.
/// </summary>
public sealed class SteamCoverBuilder(
    HttpClient http,
    ISteamStoreClient steam,
    ICoverImages covers,
    IMediaAssetRepository media,
    IConfiguration configuration,
    ILogger<SteamCoverBuilder> logger) : ISteamCoverBuilder
{
    private const string CdnBase = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/";

    public const int Width = 1920;
    public const int Height = 1440;

    public async Task<string?> BuildAsync(string appId, string gameName, CancellationToken ct)
    {
        var (bytes, extension, source) = await ComposeAsync(appId, ct);
        if (bytes is null)
        {
            logger.LogWarning("Steam app {AppId}: no usable cover artwork", appId);
            return null;
        }

        var fileName = $"{Guid.NewGuid():N}{extension}";
        var imagesFolder = Path.Combine(covers.Root, "images");
        Directory.CreateDirectory(imagesFolder);
        var physicalPath = Path.Combine(imagesFolder, fileName);
        await File.WriteAllBytesAsync(physicalPath, bytes, ct);

        var prepared = await covers.PrepareUploadAsync(physicalPath, $"images/{fileName}", ct);
        if (!prepared.Ok)
        {
            File.Delete(physicalPath);
            logger.LogWarning("Steam app {AppId}: cover rejected ({Error})", appId, prepared.Error);
            return null;
        }

        var relativeUrl = $"/uploads/images/{fileName}";
        var thumbnailUrl = await TryCreateThumbnailAsync(physicalPath, fileName, ct);
        var info = new FileInfo(physicalPath);
        await media.CreateAsync(new MediaAsset
        {
            Type = "image",
            Url = Absolute(relativeUrl),
            ThumbnailUrl = thumbnailUrl,
            Filename = $"{SuperBot.WebApi.Controllers.SeoController.Slugify(gameName)}-cover{extension}",
            ContentType = extension == ".webp" ? "image/webp" : "image/jpeg",
            SizeBytes = info.Length,
            HashSha256 = await SuperBot.WebApi.Controllers.MediaHashHelper.ComputeHashAsync(physicalPath, ct),
            Width = prepared.Width,
            Height = prepared.Height,
            CreatedAt = DateTime.UtcNow,
            Tags = ["steam", SteamGameMapper.ExternalId(appId), $"cover:{source}"],
        });
        return relativeUrl;
    }

    private async Task<(byte[]? Bytes, string Extension, string Source)> ComposeAsync(string appId, CancellationToken ct)
    {
        var assets = await steam.GetAssetsAsync(appId, ct);
        string Url(string asset, string legacyFile) => assets?.Get(asset) ?? $"{CdnBase}{appId}/{legacyFile}";

        var hero = await TryDownloadAsync(Url("library_hero", "library_hero.jpg"), ct);
        if (hero is not null && IsBlank(hero))
        {
            // Бывает, что издатель вместо арта библиотеки загрузил пустой фон (Minecraft Dungeons II —
            // один градиент). На всю обложку он даёт пустую карточку — берём капсулу магазина.
            logger.LogInformation("Steam app {AppId}: library hero is blank, using the store capsule", appId);
            hero = null;
        }
        var logo = hero is null ? null : await TryDownloadAsync($"{CdnBase}{appId}/logo_2x.png", ct) ?? await TryDownloadAsync($"{CdnBase}{appId}/logo.png", ct);
        if (hero is not null)
        {
            try
            {
                return logo is not null ? (Compose(hero, logo), ".webp", "hero+logo") : (Fill(hero), ".webp", "hero");
            }
            catch (Exception ex)
            {
                logger.LogWarning("Steam app {AppId}: cover from hero art failed ({Message}), using a store capsule", appId, ex.Message);
            }
        }

        foreach (var (asset, legacy) in new[] { ("main_capsule_2x", (string?)null), ("main_capsule", "capsule_616x353.jpg") })
        {
            var url = assets?.Get(asset) ?? (legacy is null ? null : $"{CdnBase}{appId}/{legacy}");
            if (url is null || await TryDownloadAsync(url, ct) is not { } capsule)
            {
                continue;
            }
            try
            {
                return (Fill(capsule), ".webp", asset == "main_capsule_2x" ? "capsule-2x" : "capsule");
            }
            catch (Exception ex)
            {
                logger.LogWarning("Steam app {AppId}: capsule cover failed ({Message})", appId, ex.Message);
            }
        }

        var boxUrl = assets?.Get("library_capsule_2x") ?? $"{CdnBase}{appId}/library_600x900_2x.jpg";
        return await TryDownloadAsync(boxUrl, ct) is { } box ? (box, ".jpg", "box") : (null, "", "");
    }

    /// <summary>Арт на весь кадр 4:3 и логотип по центру с мягкой тенью — чтобы читался на любом фоне.</summary>
    public static byte[] Compose(byte[] heroBytes, byte[] logoBytes)
    {
        using var hero = RasterImage.Decode(heroBytes);
        using var heroFill = hero.CropToFill(Width, Height);
        using var logoBitmap = SKBitmap.Decode(logoBytes) ?? throw new UnreadableImageException("Logo could not be decoded.");

        var info = new SKImageInfo(Width, Height, SKColorType.Rgba8888, SKAlphaType.Premul);
        using var surface = SKSurface.Create(info);
        var canvas = surface.Canvas;
        using (var background = heroFill.ToSkImage())
        {
            canvas.DrawImage(background, 0, 0);
        }

        // Лёгкое затемнение к центру: логотипы бывают и светлые, и тёмные, тень одна на всех.
        using (var shade = new SKPaint())
        {
            shade.Shader = SKShader.CreateRadialGradient(
                new SKPoint(Width / 2f, Height / 2f), Width * 0.55f,
                [new SKColor(0, 0, 0, 90), new SKColor(0, 0, 0, 0)], [0f, 1f], SKShaderTileMode.Clamp);
            canvas.DrawRect(0, 0, Width, Height, shade);
        }

        // Самая узкая рамка из центра кадра — 3:4 (1080 по ширине) и 16:9 (1080 по высоте):
        // логотип должен в них поместиться с полями.
        const float maxLogoWidth = 1080 * 0.78f;
        const float maxLogoHeight = 1080 * 0.42f;
        var scale = Math.Min(Math.Min(maxLogoWidth / logoBitmap.Width, maxLogoHeight / logoBitmap.Height), 2.5f);
        var logoWidth = logoBitmap.Width * scale;
        var logoHeight = logoBitmap.Height * scale;
        var target = SKRect.Create((Width - logoWidth) / 2f, (Height - logoHeight) / 2f, logoWidth, logoHeight);

        using (var logoImage = SKImage.FromBitmap(logoBitmap))
        using (var shadowPaint = new SKPaint())
        {
            shadowPaint.ImageFilter = SKImageFilter.CreateDropShadow(0, 6, 22, 22, new SKColor(0, 0, 0, 170));
            canvas.DrawImage(logoImage, SKRect.Create(0, 0, logoBitmap.Width, logoBitmap.Height), target,
                new SKSamplingOptions(SKCubicResampler.Mitchell), shadowPaint);
        }

        using var snapshot = surface.Snapshot();
        using var data = snapshot.Encode(SKEncodedImageFormat.Webp, 88);
        return data.ToArray();
    }

    /// <summary>Порог «рисунка нет» для DetailLevel: градиент — около 0,5, самый спокойный настоящий арт — от 3.</summary>
    public const double BlankDetailThreshold = 2.0;

    public static bool IsBlank(byte[] imageBytes)
    {
        using var image = RasterImage.Decode(imageBytes);
        return image.DetailLevel() < BlankDetailThreshold;
    }

    /// <summary>Картинка на весь кадр 4:3 — обрезкой по центру, без полей.</summary>
    public static byte[] Fill(byte[] imageBytes)
    {
        using var image = RasterImage.Decode(imageBytes);
        using var filled = image.CropToFill(Width, Height);
        using var output = new MemoryStream();
        filled.SaveWebpAsync(output, 88).GetAwaiter().GetResult();
        return output.ToArray();
    }

    private async Task<byte[]?> TryDownloadAsync(string url, CancellationToken ct)
    {
        try
        {
            using var response = await http.GetAsync(url, ct);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }
            var bytes = await response.Content.ReadAsByteArrayAsync(ct);
            return bytes.Length > 0 ? bytes : null;
        }
        catch (HttpRequestException ex)
        {
            logger.LogWarning("Steam CDN {Url}: {Message}", url, ex.Message);
            return null;
        }
    }

    private async Task<string?> TryCreateThumbnailAsync(string physicalPath, string fileName, CancellationToken ct)
    {
        try
        {
            using var image = await RasterImage.LoadAsync(physicalPath, ct);
            using var thumbnail = image.FitWithin(480);
            var folder = Path.Combine(covers.Root, "image-thumbs");
            Directory.CreateDirectory(folder);
            var thumbName = $"{Path.GetFileNameWithoutExtension(fileName)}.webp";
            await thumbnail.SaveWebpAsync(Path.Combine(folder, thumbName), 80, ct);
            return Absolute($"/uploads/image-thumbs/{thumbName}");
        }
        catch (Exception ex)
        {
            logger.LogWarning("Thumbnail for {File} failed: {Message}", fileName, ex.Message);
            return null;
        }
    }

    /// <summary>В медиатеке адреса абсолютные (так их пишет загрузка из админки); база — публичный адрес сайта.</summary>
    private string Absolute(string relativeUrl)
    {
        var baseUrl = (configuration["MainUrl"] ?? "").TrimEnd('/');
        return baseUrl.Length > 0 ? baseUrl + relativeUrl : relativeUrl;
    }
}
