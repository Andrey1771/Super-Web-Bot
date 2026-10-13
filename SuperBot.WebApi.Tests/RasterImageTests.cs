using SkiaSharp;
using SuperBot.WebApi.Services.Imaging;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Обёртка над SkiaSharp для обложек и аватаров (замена ImageSharp). Проверяется то, что легко
/// тихо сломать: поворот по EXIF (фото с телефона), обрезка к рамке с точкой фокуса, уменьшение
/// без растягивания и средний цвет.
/// </summary>
public class RasterImageTests
{
    /// <summary>JPEG width×height: левая половина красная, правая синяя; при orientation — с EXIF-блоком.</summary>
    private static byte[] Jpeg(int width, int height, int? orientation = null)
    {
        using var bitmap = new SKBitmap(width, height);
        using (var canvas = new SKCanvas(bitmap))
        {
            canvas.Clear(SKColors.Blue);
            using var red = new SKPaint { Color = SKColors.Red };
            canvas.DrawRect(SKRect.Create(0, 0, width / 2f, height), red);
        }
        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Jpeg, 95);
        var jpeg = data.ToArray();
        return orientation is null ? jpeg : WithExifOrientation(jpeg, orientation.Value);
    }

    /// <summary>Вставляет сразу за SOI сегмент APP1 с единственным тегом Orientation (0x0112).</summary>
    private static byte[] WithExifOrientation(byte[] jpeg, int orientation)
    {
        byte[] app1 =
        {
            0xFF, 0xE1, 0x00, 0x22,                   // APP1, длина 34 байта (с полем длины)
            (byte)'E', (byte)'x', (byte)'i', (byte)'f', 0x00, 0x00,
            (byte)'I', (byte)'I', 0x2A, 0x00,         // TIFF little-endian
            0x08, 0x00, 0x00, 0x00,                   // IFD0 сразу за заголовком
            0x01, 0x00,                               // одна запись
            0x12, 0x01, 0x03, 0x00,                   // Orientation, тип SHORT
            0x01, 0x00, 0x00, 0x00,                   // одно значение
            (byte)orientation, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00                    // следующего IFD нет
        };
        return jpeg.Take(2).Concat(app1).Concat(jpeg.Skip(2)).ToArray();
    }

    private static SKColor Pixel(RasterImage image, int x, int y)
    {
        using var stream = new MemoryStream();
        image.SaveWebpAsync(stream, 100).GetAwaiter().GetResult();
        using var bitmap = SKBitmap.Decode(stream.ToArray());
        return bitmap.GetPixel(x, y);
    }

    private static bool IsRed(SKColor color) => color.Red > 200 && color.Blue < 60;
    private static bool IsBlue(SKColor color) => color.Blue > 200 && color.Red < 60;

    [Fact]
    public void Plain_image_keeps_its_layout()
    {
        using var image = RasterImage.Decode(Jpeg(40, 20));
        Assert.Equal((40, 20), (image.Width, image.Height));
        Assert.True(IsRed(Pixel(image, 5, 10)) && IsBlue(Pixel(image, 35, 10)));
    }

    [Theory]
    // 6 — повернуть на 90° по часовой: левый (красный) край уходит наверх.
    [InlineData(6, 20, 40, true)]
    // 8 — на 90° против часовой: левый край уходит вниз.
    [InlineData(8, 20, 40, false)]
    public void Rotated_phone_photos_are_turned_upright(int orientation, int width, int height, bool redOnTop)
    {
        using var image = RasterImage.Decode(Jpeg(40, 20, orientation));
        Assert.Equal((width, height), (image.Width, image.Height));
        var top = Pixel(image, 10, 5);
        var bottom = Pixel(image, 10, 35);
        Assert.True(redOnTop ? IsRed(top) && IsBlue(bottom) : IsBlue(top) && IsRed(bottom));
    }

    [Theory]
    [InlineData(2)] // зеркало по горизонтали
    [InlineData(3)] // 180°
    public void Mirrored_and_upside_down_photos_swap_left_and_right(int orientation)
    {
        using var image = RasterImage.Decode(Jpeg(40, 20, orientation));
        Assert.Equal((40, 20), (image.Width, image.Height));
        Assert.True(IsBlue(Pixel(image, 5, 10)) && IsRed(Pixel(image, 35, 10)));
    }

    [Fact]
    public void Crop_follows_the_focus_point_within_the_edges()
    {
        using var image = RasterImage.Decode(Jpeg(400, 100));

        using var centered = image.CropToFill(100, 100);
        Assert.Equal((100, 100), (centered.Width, centered.Height));
        Assert.True(IsRed(Pixel(centered, 10, 50)) && IsBlue(Pixel(centered, 90, 50)));

        // Фокус у левого края: окно упирается в край и целиком красное, за край не выходит.
        using var left = image.CropToFill(100, 100, focusX: 0);
        Assert.True(IsRed(Pixel(left, 5, 50)) && IsRed(Pixel(left, 95, 50)));
    }

    [Fact]
    public void Fit_shrinks_the_long_side_and_never_enlarges()
    {
        using var image = RasterImage.Decode(Jpeg(400, 100));
        using var small = image.FitWithin(200);
        Assert.Equal((200, 50), (small.Width, small.Height));
        using var same = image.FitWithin(1000);
        Assert.Equal((400, 100), (same.Width, same.Height));
    }

    [Fact]
    public void Average_color_mixes_all_pixels()
    {
        using var image = RasterImage.Decode(Jpeg(40, 20));
        var hex = image.AverageColorHex();
        Assert.Matches("^#[0-9a-f]{6}$", hex);
        var red = Convert.ToInt32(hex[1..3], 16);
        var blue = Convert.ToInt32(hex[5..7], 16);
        Assert.InRange(red, 100, 155);
        Assert.InRange(blue, 100, 155);
    }

    [Fact]
    public void Identify_reads_the_size_without_decoding_and_rejects_non_images()
    {
        Assert.Equal((40, 20), RasterImage.Identify(Jpeg(40, 20)));
        Assert.Null(RasterImage.Identify("not an image"u8.ToArray()));
        Assert.Throws<UnreadableImageException>(() => RasterImage.Decode("not an image"u8.ToArray()));
    }
}
