using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;
using SuperBot.WebApi.Services;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Варианты обложек для витрины и точка фокуса для админки. См. <see cref="CoverImages"/>.
///
/// Готовый вариант лежит на диске под /uploads/v/… и отдаётся статикой, сюда запрос попадает только когда файла
/// ещё нет: контроллер делает его и отдаёт сам. Кэш у вариантов сутки, а не год: после смены точки фокуса та же
/// ссылка должна показать новую обрезку.
/// </summary>
[ApiController]
public class CoverImageController : ControllerBase
{
    private readonly ICoverImages _covers;

    public CoverImageController(ICoverImages covers)
    {
        _covers = covers;
    }

    [HttpGet("uploads/v/{width:int}/{ratio}/{**path}")]
    [AllowAnonymous]
    public async Task<IActionResult> Variant(int width, string ratio, string path, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(path) || !path.EndsWith(".webp", StringComparison.OrdinalIgnoreCase))
        {
            return NotFound();
        }
        var variant = await _covers.GetVariantPathAsync(path[..^".webp".Length], width, ratio, ct);
        if (variant == null)
        {
            return NotFound();
        }

        var info = new FileInfo(variant);
        Response.Headers[HeaderNames.CacheControl] = "public, max-age=86400";
        return PhysicalFile(variant, "image/webp", info.LastWriteTimeUtc, new EntityTagHeaderValue($"\"{info.Length:x}-{info.LastWriteTimeUtc.Ticks:x}\""));
    }

    /// <summary>Метаданные обложки для редактора точки фокуса. path — адрес или путь картинки под /uploads.</summary>
    [HttpGet("api/images/meta")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Meta([FromQuery] string path, CancellationToken ct)
    {
        var meta = await _covers.GetMetaAsync(path, ct);
        return meta == null ? NotFound(new { message = "This image is not in the uploads folder." }) : Ok(Map(meta));
    }

    [HttpPut("api/images/meta")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> SetFocus([FromBody] CoverFocusRequest request, CancellationToken ct)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Path))
        {
            return BadRequest(new { message = "path is required." });
        }
        var meta = await _covers.SetFocusAsync(request.Path, request.FocusX, request.FocusY, ct);
        return meta == null ? NotFound(new { message = "This image is not in the uploads folder." }) : Ok(Map(meta));
    }

    private static object Map(Core.Entities.CoverImageMeta meta) => new
    {
        path = meta.Path,
        focusX = meta.FocusX,
        focusY = meta.FocusY,
        width = meta.Width,
        height = meta.Height,
        dominantColor = meta.DominantColor,
        minLongSide = CoverImages.MinLongSide,
        recommendedLongSide = CoverImages.RecommendedLongSide
    };

    public class CoverFocusRequest
    {
        public string Path { get; set; } = string.Empty;
        public double FocusX { get; set; } = 0.5;
        public double FocusY { get; set; } = 0.5;
    }
}
