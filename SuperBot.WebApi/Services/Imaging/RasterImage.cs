using SkiaSharp;

namespace SuperBot.WebApi.Services.Imaging;

/// <summary>Файл не удаётся прочитать как картинку: неизвестный формат или битое содержимое.</summary>
public sealed class UnreadableImageException(string message) : Exception(message);

/// <summary>
/// Растровая картинка для обложек, аватаров и миниатюр — тонкая обёртка над SkiaSharp (MIT).
/// Раньше это делал ImageSharp, но с 4-й версии он требует платный лицензионный ключ даже для
/// сборки. Здесь ровно то, что нужно сайту: чтение с поворотом по EXIF, обрезка под рамку с
/// точкой фокуса, вписывание, средний цвет и запись в WebP/JPEG/PNG.
///
/// Картинка всегда уже развёрнута по EXIF: фото с телефона, снятое «боком», хранится как есть,
/// а ориентация лежит в метаданных — без поворота обрезка резала бы не тот край.
/// </summary>
public sealed class RasterImage : IDisposable
{
    private readonly SKBitmap _bitmap;

    private RasterImage(SKBitmap bitmap) => _bitmap = bitmap;

    public int Width => _bitmap.Width;

    public int Height => _bitmap.Height;

    public static async Task<RasterImage> LoadAsync(string path, CancellationToken ct = default) =>
        Decode(await File.ReadAllBytesAsync(path, ct));

    public static async Task<RasterImage> LoadAsync(Stream stream, CancellationToken ct = default)
    {
        using var buffer = new MemoryStream();
        await stream.CopyToAsync(buffer, ct);
        return Decode(buffer.ToArray());
    }

    /// <summary>Размер по заголовку файла, без декодирования пикселей. null — не картинка.</summary>
    public static (int Width, int Height)? Identify(string path)
    {
        using var codec = SKCodec.Create(path);
        return SizeOf(codec);
    }

    /// <inheritdoc cref="Identify(string)"/>
    public static (int Width, int Height)? Identify(byte[] bytes)
    {
        using var data = SKData.CreateCopy(bytes);
        using var codec = SKCodec.Create(data);
        return SizeOf(codec);
    }

    private static (int Width, int Height)? SizeOf(SKCodec? codec) =>
        codec is null || codec.Info.Width <= 0 || codec.Info.Height <= 0 ? null : (codec.Info.Width, codec.Info.Height);

    public static RasterImage Decode(byte[] bytes)
    {
        using var data = SKData.CreateCopy(bytes);
        using var codec = SKCodec.Create(data)
                          ?? throw new UnreadableImageException("Unknown image format.");
        var info = new SKImageInfo(codec.Info.Width, codec.Info.Height, SKColorType.Rgba8888, SKAlphaType.Premul);
        var decoded = new SKBitmap(info);
        var result = codec.GetPixels(info, decoded.GetPixels());
        if (result != SKCodecResult.Success)
        {
            decoded.Dispose();
            throw new UnreadableImageException($"The image could not be decoded ({result}).");
        }
        return new RasterImage(Orient(decoded, codec.EncodedOrigin));
    }

    /// <summary>
    /// Заполнить рамку width×height: картинка масштабируется так, чтобы закрыть рамку целиком,
    /// лишнее срезается. Окно обрезки встаёт центром на точку фокуса (доли 0..1), насколько
    /// позволяют края.
    /// </summary>
    public RasterImage CropToFill(int width, int height, double focusX = 0.5, double focusY = 0.5)
    {
        var scale = Math.Max(width / (double)Width, height / (double)Height);
        var windowWidth = width / scale;
        var windowHeight = height / scale;
        var left = Math.Clamp(focusX * Width - windowWidth / 2, 0, Width - windowWidth);
        var top = Math.Clamp(focusY * Height - windowHeight / 2, 0, Height - windowHeight);
        var window = SKRect.Create((float)left, (float)top, (float)windowWidth, (float)windowHeight);
        return Render(width, height, window, scale);
    }

    /// <summary>Уменьшить так, чтобы длинная сторона стала не больше maxSide. Меньшую картинку не трогает.</summary>
    public RasterImage FitWithin(int maxSide)
    {
        var scale = Math.Min(1d, maxSide / (double)Math.Max(Width, Height));
        var width = Math.Max(1, (int)Math.Round(Width * scale));
        var height = Math.Max(1, (int)Math.Round(Height * scale));
        return Render(width, height, SKRect.Create(0, 0, Width, Height), scale);
    }

    /// <summary>Средний цвет всех пикселей, «#rrggbb». Прозрачные пиксели в среднее не входят.</summary>
    public string AverageColorHex()
    {
        long red = 0, green = 0, blue = 0, alpha = 0;
        var pixels = _bitmap.GetPixelSpan();
        for (var i = 0; i + 3 < pixels.Length; i += 4)
        {
            // Rgba8888, premultiplied: сумма цвета уже взвешена прозрачностью.
            red += pixels[i];
            green += pixels[i + 1];
            blue += pixels[i + 2];
            alpha += pixels[i + 3];
        }
        if (alpha == 0)
        {
            return "#000000";
        }
        static int Channel(long sum, long alpha) => (int)Math.Clamp(Math.Round(sum * 255d / alpha), 0, 255);
        return $"#{Channel(red, alpha):x2}{Channel(green, alpha):x2}{Channel(blue, alpha):x2}";
    }

    public Task SaveWebpAsync(string path, int quality, CancellationToken ct = default) =>
        SaveAsync(path, SKEncodedImageFormat.Webp, quality, ct);

    public Task SaveWebpAsync(Stream stream, int quality, CancellationToken ct = default) =>
        WriteAsync(stream, SKEncodedImageFormat.Webp, quality, ct);

    /// <summary>Записать в формате по расширению файла (.png, .webp, иначе JPEG).</summary>
    public Task SaveByExtensionAsync(string path, CancellationToken ct = default) =>
        Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".png" => SaveAsync(path, SKEncodedImageFormat.Png, 100, ct),
            ".webp" => SaveAsync(path, SKEncodedImageFormat.Webp, 85, ct),
            _ => SaveAsync(path, SKEncodedImageFormat.Jpeg, 88, ct)
        };

    public void Dispose() => _bitmap.Dispose();

    private async Task SaveAsync(string path, SKEncodedImageFormat format, int quality, CancellationToken ct)
    {
        await using var file = File.Create(path);
        await WriteAsync(file, format, quality, ct);
    }

    private async Task WriteAsync(Stream stream, SKEncodedImageFormat format, int quality, CancellationToken ct)
    {
        using var image = SKImage.FromBitmap(_bitmap);
        using var data = image.Encode(format, quality)
                         ?? throw new InvalidOperationException($"Could not encode the image as {format}.");
        await stream.WriteAsync(data.ToArray(), ct);
    }

    private RasterImage Render(int width, int height, SKRect sourceWindow, double scale)
    {
        var target = new SKBitmap(new SKImageInfo(width, height, SKColorType.Rgba8888, SKAlphaType.Premul));
        using var canvas = new SKCanvas(target);
        using var image = SKImage.FromBitmap(_bitmap);
        // Сильное уменьшение — через mip-уровни, иначе тонкие детали дают муар; умеренное — кубикой.
        var sampling = scale < 0.5
            ? new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear)
            : new SKSamplingOptions(SKCubicResampler.Mitchell);
        canvas.DrawImage(image, sourceWindow, SKRect.Create(0, 0, width, height), sampling);
        return new RasterImage(target);
    }

    /// <summary>Разворот по EXIF-ориентации: восемь вариантов — повороты и зеркала.</summary>
    private static SKBitmap Orient(SKBitmap source, SKEncodedOrigin origin)
    {
        if (origin == SKEncodedOrigin.TopLeft)
        {
            return source;
        }

        float w = source.Width, h = source.Height;
        var swap = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
        // x' = ScaleX·x + SkewX·y + TransX; y' = SkewY·x + ScaleY·y + TransY.
        var matrix = origin switch
        {
            SKEncodedOrigin.TopRight => new SKMatrix(-1, 0, w, 0, 1, 0, 0, 0, 1),     // зеркало по горизонтали
            SKEncodedOrigin.BottomRight => new SKMatrix(-1, 0, w, 0, -1, h, 0, 0, 1), // 180°
            SKEncodedOrigin.BottomLeft => new SKMatrix(1, 0, 0, 0, -1, h, 0, 0, 1),   // зеркало по вертикали
            SKEncodedOrigin.LeftTop => new SKMatrix(0, 1, 0, 1, 0, 0, 0, 0, 1),       // транспонирование
            SKEncodedOrigin.RightTop => new SKMatrix(0, -1, h, 1, 0, 0, 0, 0, 1),     // 90° по часовой
            SKEncodedOrigin.RightBottom => new SKMatrix(0, -1, h, -1, 0, w, 0, 0, 1), // поперечное отражение
            SKEncodedOrigin.LeftBottom => new SKMatrix(0, 1, 0, -1, 0, w, 0, 0, 1),   // 90° против часовой
            _ => SKMatrix.Identity
        };

        var oriented = new SKBitmap(new SKImageInfo(swap ? source.Height : source.Width, swap ? source.Width : source.Height,
            source.ColorType, source.AlphaType));
        using (var canvas = new SKCanvas(oriented))
        {
            canvas.SetMatrix(matrix);
            canvas.DrawBitmap(source, 0, 0);
        }
        source.Dispose();
        return oriented;
    }
}
