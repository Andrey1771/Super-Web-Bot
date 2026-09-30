using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;
using SuperBot.WebApi.Services;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Обложки: один исходник — много рамок. Витрина получает варианты нужной ширины и пропорции, обрезанные вокруг
/// точки фокуса; исходник проверяется и ужимается при загрузке. Раньше карточки грузили исходник как есть —
/// PNG на 5 МБ в каждой плитке, — а вертикальная картинка растягивала весь ряд.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class CoverImagesTests
{
    private readonly TaleShopApiFactory _factory;

    public CoverImagesTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient Admin()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "agent@taleshop.test");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        return client;
    }

    /// <summary>Картинка width×height: левая половина красная, правая синяя — по цвету видно, куда легла обрезка.</summary>
    private static byte[] Png(int width, int height)
    {
        using var image = new Image<Rgba32>(width, height);
        var red = new Rgba32(255, 0, 0);
        var blue = new Rgba32(0, 0, 255);
        image.ProcessPixelRows(accessor =>
        {
            for (var y = 0; y < accessor.Height; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (var x = 0; x < row.Length; x++)
                {
                    row[x] = x < width / 2 ? red : blue;
                }
            }
        });
        using var ms = new MemoryStream();
        image.Save(ms, new PngEncoder());
        return ms.ToArray();
    }

    /// <summary>Кладёт файл прямо в папку загрузок, как лежат старые обложки без метаданных.</summary>
    private string Seed(string relativePath, byte[] bytes)
    {
        var full = Path.Combine(_factory.UploadsRoot, relativePath.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        File.WriteAllBytes(full, bytes);
        return full;
    }

    private static async Task<Image<Rgba32>> DecodeAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("image/webp", response.Content.Headers.ContentType?.MediaType);
        return Image.Load<Rgba32>(await response.Content.ReadAsByteArrayAsync());
    }

    private static MultipartFormDataContent Upload(byte[] bytes, string fileName)
    {
        var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        content.Add(file, "file", fileName);
        return content;
    }

    // ---------- варианты ----------

    [Fact]
    public async Task Storefront_gets_a_webp_of_the_requested_width_and_frame_not_the_original()
    {
        var name = $"images/{Guid.NewGuid():N}.png";
        Seed(name, Png(1600, 1200));
        var client = _factory.CreateClient();

        var square = await client.GetAsync($"/uploads/v/240/sq/{name}.webp");
        using (var image = await DecodeAsync(square))
        {
            Assert.Equal((240, 240), (image.Width, image.Height));
        }
        Assert.Contains("max-age=86400", square.Headers.CacheControl?.ToString());

        // Второй запрос отдаёт уже готовый файл с диска — статикой, с теми же заголовками.
        var again = await client.GetAsync($"/uploads/v/240/sq/{name}.webp");
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Contains("max-age=86400", again.Headers.CacheControl?.ToString());
        Assert.True(File.Exists(Path.Combine(_factory.UploadsRoot, "v", "240", "sq", name.Replace('/', Path.DirectorySeparatorChar) + ".webp")));

        using var wide = await DecodeAsync(await client.GetAsync($"/uploads/v/480/16x9/{name}.webp"));
        Assert.Equal((480, 270), (wide.Width, wide.Height));
    }

    [Fact]
    public async Task Small_sources_are_never_upscaled()
    {
        var name = $"images/{Guid.NewGuid():N}.png";
        Seed(name, Png(300, 400));

        using var portrait = await DecodeAsync(await _factory.CreateClient().GetAsync($"/uploads/v/960/3x4/{name}.webp"));
        Assert.Equal((300, 400), (portrait.Width, portrait.Height));
    }

    [Theory]
    [InlineData("/uploads/v/999/sq/images/x.png.webp")]        // ширина не из списка
    [InlineData("/uploads/v/240/5x7/images/x.png.webp")]       // рамка не из списка
    [InlineData("/uploads/v/240/sq/../images/x.png.webp")]     // выход из папки
    [InlineData("/uploads/v/240/sq/demo-covers/a.svg.webp")]   // svg не режем
    [InlineData("/uploads/v/240/sq/images/missing.png.webp")]  // исходника нет
    public async Task Unknown_or_unsafe_variant_requests_are_not_found(string url)
    {
        var response = await _factory.CreateClient().GetAsync(url);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---------- точка фокуса ----------

    [Fact]
    public async Task Focus_point_moves_the_crop_and_invalidates_rendered_variants()
    {
        var name = $"images/{Guid.NewGuid():N}.png";
        Seed(name, Png(2000, 500));               // широкая: слева красное, справа синее
        var client = _factory.CreateClient();
        var admin = Admin();

        using (var centered = await DecodeAsync(await client.GetAsync($"/uploads/v/240/sq/{name}.webp")))
        {
            // Центр картинки — граница цветов: левая часть квадрата красная, правая синяя.
            Assert.True(centered[10, 120].R > 200 && centered[230, 120].B > 200);
        }

        var meta = await (await admin.GetAsync($"/api/images/meta?path=/uploads/{name}")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0.5, meta.GetProperty("focusX").GetDouble());
        Assert.Equal(2000, meta.GetProperty("width").GetInt32());
        Assert.StartsWith("#", meta.GetProperty("dominantColor").GetString());

        var set = await admin.PutAsJsonAsync("/api/images/meta", new { path = $"http://localhost/uploads/{name}", focusX = 0.05, focusY = 0.5 });
        Assert.Equal(HttpStatusCode.OK, set.StatusCode);

        using var left = await DecodeAsync(await client.GetAsync($"/uploads/v/240/sq/{name}.webp"));
        // Фокус у левого края — квадрат целиком красный.
        Assert.True(left[10, 120].R > 200 && left[230, 120].R > 200 && left[230, 120].B < 60);
    }

    [Fact]
    public async Task Focus_point_is_clamped_and_unknown_images_are_rejected()
    {
        var name = $"images/{Guid.NewGuid():N}.png";
        Seed(name, Png(800, 800));
        var admin = Admin();

        var meta = await (await admin.PutAsJsonAsync("/api/images/meta", new { path = name, focusX = 7, focusY = -3 })).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, meta.GetProperty("focusX").GetDouble());
        Assert.Equal(0, meta.GetProperty("focusY").GetDouble());

        var missing = await admin.PutAsJsonAsync("/api/images/meta", new { path = "images/nope.png", focusX = 0.5, focusY = 0.5 });
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);

        var anonymous = await _factory.CreateClient().PutAsJsonAsync("/api/images/meta", new { path = name, focusX = 0.5, focusY = 0.5 });
        Assert.NotEqual(HttpStatusCode.OK, anonymous.StatusCode);
    }

    // ---------- загрузка ----------

    [Fact]
    public async Task Upload_rejects_tiny_covers_and_explains_the_minimum()
    {
        var imagesDir = Path.Combine(_factory.UploadsRoot, "images");
        var before = Directory.Exists(imagesDir) ? Directory.GetFiles(imagesDir, "*.png").Length : 0;

        var response = await Admin().PostAsync("/api/media/upload", Upload(Png(400, 300), "tiny.png"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains($"{CoverImages.MinLongSide}px", await response.Content.ReadAsStringAsync());
        // Отказанный файл не остаётся на диске.
        Assert.Equal(before, Directory.Exists(imagesDir) ? Directory.GetFiles(imagesDir, "*.png").Length : 0);
    }

    [Fact]
    public async Task Upload_shrinks_huge_masters_warns_about_odd_shapes_and_records_the_cover_color()
    {
        var response = await Admin().PostAsync("/api/media/upload", Upload(Png(3600, 1200), "banner.png"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(CoverImages.MasterMaxSide, body.GetProperty("width").GetInt32());   // 3600 → 2400
        Assert.Equal(800, body.GetProperty("height").GetInt32());

        var url = body.GetProperty("url").GetString()!;
        var relative = url[url.IndexOf("/uploads/", StringComparison.Ordinal)..];
        using var master = Image.Load<Rgba32>(Path.Combine(_factory.UploadsRoot, relative["/uploads/".Length..]));
        Assert.Equal(2400, master.Width);

        // Предупреждение о необычных пропорциях даёт сам сервис обложек (медиатека его не показывает).
        using (var scope = _factory.Services.CreateScope())
        {
            var covers = scope.ServiceProvider.GetRequiredService<ICoverImages>();
            var probe = Path.Combine(_factory.UploadsRoot, $"probe-{Guid.NewGuid():N}.png");
            await File.WriteAllBytesAsync(probe, Png(3600, 1200));
            var prepared = await covers.PrepareUploadAsync(probe, Path.GetFileName(probe), CancellationToken.None);
            Assert.Contains("UNUSUAL_RATIO", prepared.Warnings);
        }

        var meta = await (await Admin().GetAsync($"/api/images/meta?path={relative}")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(2400, meta.GetProperty("width").GetInt32());
        Assert.Matches("^#[0-9a-f]{6}$", meta.GetProperty("dominantColor").GetString()!);
    }

    [Fact]
    public async Task Media_library_upload_applies_the_same_cover_rules()
    {
        var admin = Admin();

        var tiny = await admin.PostAsync("/api/media/upload", Upload(Png(200, 200), "tiny.png"));
        Assert.Equal(HttpStatusCode.BadRequest, tiny.StatusCode);
        Assert.Contains($"{CoverImages.MinLongSide}px", await tiny.Content.ReadAsStringAsync());

        var ok = await admin.PostAsync("/api/media/upload", Upload(Png(1400, 1000), "cover.png"));
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        var asset = await ok.Content.ReadFromJsonAsync<JsonElement>();
        var url = asset.GetProperty("url").GetString()!;
        var relative = url[url.IndexOf("/uploads/", StringComparison.Ordinal)..];

        using var variant = await DecodeAsync(await _factory.CreateClient().GetAsync($"/uploads/v/240/3x4{relative.Replace("/uploads", string.Empty)}.webp"));
        Assert.Equal((240, 320), (variant.Width, variant.Height));
    }
}
