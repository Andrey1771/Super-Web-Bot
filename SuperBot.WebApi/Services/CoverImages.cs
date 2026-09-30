using System.Collections.Concurrent;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Services.Imaging;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Обложки товаров: один исходник — много рамок.
///
/// Как у больших магазинов: посетитель никогда не получает исходный файл. Витрина просит копию нужной ширины и
/// пропорции (<c>/uploads/v/{ширина}/{рамка}/{путь}.webp</c>), сервер делает её при первом обращении и кладёт на
/// диск, дальше её отдаёт обычная статика. Обрезка под рамку идёт вокруг точки фокуса, которую админ ставит в
/// карточке товара, — так квадрат, вертикаль и широкая полоса режутся из одной картинки без отрезанных голов.
///
/// Исходник при загрузке проверяется (слишком маленький — отказ) и ужимается до разумного предела, чтобы одна
/// картинка на 20 МБ не жила на диске и не гонялась через ImageSharp при каждой новой рамке.
/// </summary>
public interface ICoverImages
{
    /// <summary>Папка загрузок на диске (wwwroot/uploads или Uploads:Root из настроек).</summary>
    string Root { get; }

    /// <summary>Путь варианта на диске; null — исходника нет, формат не тот или параметры не из списка.</summary>
    Task<string?> GetVariantPathAsync(string relativePath, int width, string ratio, CancellationToken ct);

    /// <summary>
    /// Проверка и подготовка только что загруженной картинки: минимальный размер, ужатие исходника, размеры,
    /// цвет. Не прошла — файл надо удалить, причина в <see cref="CoverPreparation.Error"/>.
    /// </summary>
    Task<CoverPreparation> PrepareUploadAsync(string physicalPath, string relativePath, CancellationToken ct);

    /// <summary>Метаданные обложки; если их ещё нет — считаются по файлу с точкой фокуса в центре.</summary>
    Task<CoverImageMeta?> GetMetaAsync(string relativePath, CancellationToken ct);

    /// <summary>Переставить точку фокуса. Готовые варианты этой картинки стираются: рамки перережутся вокруг новой точки.</summary>
    Task<CoverImageMeta?> SetFocusAsync(string relativePath, double focusX, double focusY, CancellationToken ct);

    /// <summary>Относительный путь под папкой загрузок из адреса или пути; null — не наш файл.</summary>
    string? NormalizeRelativePath(string? pathOrUrl);
}

public sealed record CoverPreparation(bool Ok, string? ErrorCode, string? Error, int Width, int Height, IReadOnlyList<string> Warnings, CoverImageMeta? Meta)
{
    public static CoverPreparation Fail(string code, string error) => new(false, code, error, 0, 0, Array.Empty<string>(), null);
}

public class CoverImages : ICoverImages
{
    /// <summary>Ширины, которые витрина запрашивает через srcset; 24 — размытая заглушка, пока грузится настоящая.</summary>
    public static readonly int[] Widths = { 24, 240, 480, 960, 1400 };

    /// <summary>Рамки витрины. Ключ — сегмент адреса; значение — пропорция (ширина, высота).</summary>
    public static readonly IReadOnlyDictionary<string, (int W, int H)> Ratios = new Dictionary<string, (int, int)>(StringComparer.OrdinalIgnoreCase)
    {
        ["sq"] = (1, 1),
        ["3x4"] = (3, 4),
        ["4x3"] = (4, 3),
        ["16x9"] = (16, 9),
        ["3x2"] = (3, 2)
    };

    /// <summary>Меньше — отказ: на большом экране такая обложка превращается в мыло.</summary>
    public const int MinLongSide = 600;
    /// <summary>Меньше — предупреждение админу: сойдёт для плиток, но не для широкой шапки.</summary>
    public const int RecommendedLongSide = 1200;
    /// <summary>Больше не храним: ужимаем исходник, качество на витрине от этого не страдает.</summary>
    public const int MasterMaxSide = 2400;
    /// <summary>Пропорции шире/выше этих не лягут ни в одну рамку без больших потерь.</summary>
    public const double UnusualRatioMax = 2.2;

    private static readonly HashSet<string> SourceExtensions = new(StringComparer.OrdinalIgnoreCase) { ".jpg", ".jpeg", ".png", ".webp" };
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> Locks = new(StringComparer.OrdinalIgnoreCase);

    private readonly ICoverImageMetaRepository _meta;
    private readonly ILogger<CoverImages> _logger;

    public string Root { get; }

    public CoverImages(IConfiguration configuration, IWebHostEnvironment env, ICoverImageMetaRepository meta, ILogger<CoverImages> logger)
    {
        _meta = meta;
        _logger = logger;
        Root = ResolveRoot(configuration, env);
        Directory.CreateDirectory(Root);
    }

    /// <summary>Та же папка, что и у статики /uploads в Program.cs: настройка Uploads:Root перекрывает wwwroot/uploads.</summary>
    public static string ResolveRoot(IConfiguration configuration, IWebHostEnvironment env)
    {
        var configured = configuration["Uploads:Root"];
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return Path.GetFullPath(configured);
        }
        var webRoot = string.IsNullOrWhiteSpace(env.WebRootPath)
            ? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot")
            : env.WebRootPath;
        return Path.GetFullPath(Path.Combine(webRoot, "uploads"));
    }

    public string? NormalizeRelativePath(string? pathOrUrl)
    {
        if (string.IsNullOrWhiteSpace(pathOrUrl))
        {
            return null;
        }
        var value = pathOrUrl.Trim().Replace('\\', '/');
        if (Uri.TryCreate(value, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps))
        {
            value = uri.AbsolutePath;
        }
        value = Uri.UnescapeDataString(value);
        var uploads = value.IndexOf("/uploads/", StringComparison.OrdinalIgnoreCase);
        if (uploads >= 0)
        {
            value = value[(uploads + "/uploads/".Length)..];
        }
        else if (value.StartsWith("uploads/", StringComparison.OrdinalIgnoreCase))
        {
            value = value["uploads/".Length..];
        }
        value = value.TrimStart('/');

        if (value.Length == 0
            || value.Split('/').Any(segment => segment is "" or "." or "..")
            || value.StartsWith("v/", StringComparison.OrdinalIgnoreCase)
            || !SourceExtensions.Contains(Path.GetExtension(value)))
        {
            return null;
        }
        return value;
    }

    private string? SourcePath(string relativePath)
    {
        var full = Path.GetFullPath(Path.Combine(Root, relativePath));
        if (!full.StartsWith(Root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !File.Exists(full))
        {
            return null;
        }
        return full;
    }

    private string VariantPath(string relativePath, int width, string ratio) =>
        Path.Combine(Root, "v", width.ToString(), ratio.ToLowerInvariant(), relativePath.Replace('/', Path.DirectorySeparatorChar) + ".webp");

    public async Task<string?> GetVariantPathAsync(string relativePath, int width, string ratio, CancellationToken ct)
    {
        var relative = NormalizeRelativePath(relativePath);
        if (relative == null || !Widths.Contains(width) || !Ratios.TryGetValue(ratio, out var frame))
        {
            return null;
        }
        var source = SourcePath(relative);
        if (source == null)
        {
            return null;
        }

        var target = VariantPath(relative, width, ratio);
        if (File.Exists(target))
        {
            return target;
        }

        var gate = Locks.GetOrAdd(target, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            if (File.Exists(target))
            {
                return target;
            }
            var meta = await GetMetaAsync(relative, ct);
            await RenderVariantAsync(source, target, width, frame, meta, ct);
            return target;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "Could not render cover variant {Width}/{Ratio} for {Path}.", width, ratio, relative);
            return null;
        }
        finally
        {
            gate.Release();
        }
    }

    private static async Task RenderVariantAsync(string source, string target, int width, (int W, int H) frame, CoverImageMeta? meta, CancellationToken ct)
    {
        using var image = await RasterImage.LoadAsync(source, ct);

        // Самая большая область нужной пропорции, которая помещается в исходник, — потом она ужимается до запрошенной
        // ширины. Так рамка никогда не растягивает картинку: маленький исходник даёт вариант поменьше, а не мыло.
        var coverWidth = Math.Min(image.Width, image.Height * frame.W / (double)frame.H);
        var coverHeight = coverWidth * frame.H / frame.W;
        var scale = Math.Min(1d, width / coverWidth);
        var targetWidth = Math.Max(1, (int)Math.Round(coverWidth * scale));
        var targetHeight = Math.Max(1, (int)Math.Round(coverHeight * scale));

        // Точка фокуса: обрезка держит её в кадре, а не режет по центру.
        using var variant = image.CropToFill(targetWidth, targetHeight, meta?.FocusX ?? 0.5, meta?.FocusY ?? 0.5);

        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        var temp = target + $".{Guid.NewGuid():N}.tmp";
        await variant.SaveWebpAsync(temp, width <= 24 ? 40 : 80, ct);
        File.Move(temp, target, overwrite: true);
    }

    public async Task<CoverPreparation> PrepareUploadAsync(string physicalPath, string relativePath, CancellationToken ct)
    {
        if (!SourceExtensions.Contains(Path.GetExtension(physicalPath)))
        {
            // gif и прочее: вариантов не будет, но и мешать загрузке нечем.
            return new CoverPreparation(true, null, null, 0, 0, Array.Empty<string>(), null);
        }

        RasterImage image;
        try
        {
            image = await RasterImage.LoadAsync(physicalPath, ct);
        }
        catch (UnreadableImageException)
        {
            return CoverPreparation.Fail("COVER_UNREADABLE", "The file is not a readable image.");
        }

        try
        {
            var longSide = Math.Max(image.Width, image.Height);
            if (longSide < MinLongSide)
            {
                return CoverPreparation.Fail("COVER_TOO_SMALL",
                    $"The image is {image.Width}×{image.Height}. Covers need at least {MinLongSide}px on the long side; {RecommendedLongSide}px or more looks sharp everywhere.");
            }

            var warnings = new List<string>();
            if (longSide < RecommendedLongSide)
            {
                warnings.Add("SMALL");
            }
            var aspect = image.Width / (double)image.Height;
            if (aspect > UnusualRatioMax || aspect < 1 / UnusualRatioMax)
            {
                warnings.Add("UNUSUAL_RATIO");
            }

            if (longSide > MasterMaxSide)
            {
                // Хранится уже уменьшенный и развёрнутый по EXIF мастер: дальше все рамки режутся из него.
                var master = image.FitWithin(MasterMaxSide);
                image.Dispose();
                image = master;
                await image.SaveByExtensionAsync(physicalPath, ct);
            }

            var relative = NormalizeRelativePath(relativePath);
            var meta = new CoverImageMeta
            {
                Path = relative ?? relativePath,
                Width = image.Width,
                Height = image.Height,
                DominantColor = image.AverageColorHex(),
                UpdatedAt = DateTime.UtcNow
            };
            if (relative != null)
            {
                await _meta.UpsertAsync(meta, ct);
            }
            return new CoverPreparation(true, null, null, image.Width, image.Height, warnings, meta);
        }
        finally
        {
            image.Dispose();
        }
    }

    public async Task<CoverImageMeta?> GetMetaAsync(string relativePath, CancellationToken ct)
    {
        var relative = NormalizeRelativePath(relativePath);
        if (relative == null)
        {
            return null;
        }
        var existing = await _meta.GetAsync(relative, ct);
        if (existing != null)
        {
            return existing;
        }

        // Старые загрузки метаданных не имели — считаем по файлу один раз.
        var source = SourcePath(relative);
        if (source == null)
        {
            return null;
        }
        try
        {
            using var image = await RasterImage.LoadAsync(source, ct);
            var meta = new CoverImageMeta
            {
                Path = relative,
                Width = image.Width,
                Height = image.Height,
                DominantColor = image.AverageColorHex(),
                UpdatedAt = DateTime.UtcNow
            };
            await _meta.UpsertAsync(meta, ct);
            return meta;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "Could not read cover {Path}.", relative);
            return new CoverImageMeta { Path = relative, UpdatedAt = DateTime.UtcNow };
        }
    }

    public async Task<CoverImageMeta?> SetFocusAsync(string relativePath, double focusX, double focusY, CancellationToken ct)
    {
        var meta = await GetMetaAsync(relativePath, ct);
        if (meta == null)
        {
            return null;
        }
        meta.FocusX = Math.Clamp(focusX, 0, 1);
        meta.FocusY = Math.Clamp(focusY, 0, 1);
        meta.UpdatedAt = DateTime.UtcNow;
        await _meta.UpsertAsync(meta, ct);
        InvalidateVariants(meta.Path);
        return meta;
    }

    private void InvalidateVariants(string relativePath)
    {
        var suffix = relativePath.Replace('/', Path.DirectorySeparatorChar) + ".webp";
        foreach (var width in Widths)
        {
            foreach (var ratio in Ratios.Keys)
            {
                var file = Path.Combine(Root, "v", width.ToString(), ratio, suffix);
                try
                {
                    if (File.Exists(file))
                    {
                        File.Delete(file);
                    }
                }
                catch (IOException ex)
                {
                    _logger.LogWarning(ex, "Could not delete stale cover variant {File}.", file);
                }
            }
        }
    }
}
