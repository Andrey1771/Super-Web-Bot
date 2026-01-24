using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/media")]
public class MediaController : ControllerBase
{
    private readonly string _uploadFolder;
    private readonly IMediaAssetRepository _mediaRepository;
    private readonly IGameRepository _gameRepository;

    public MediaController(
        IWebHostEnvironment env,
        IMediaAssetRepository mediaRepository,
        IGameRepository gameRepository)
    {
        _mediaRepository = mediaRepository;
        _gameRepository = gameRepository;
        _uploadFolder = Path.Combine(env.WebRootPath, "uploads");
        if (!Directory.Exists(_uploadFolder))
        {
            Directory.CreateDirectory(_uploadFolder);
        }
    }

    [HttpPost("upload")]
    [Authorize(Roles = "admin")]
    [RequestSizeLimit(20_000_000)]
    public async Task<IActionResult> UploadImage(IFormFile file, CancellationToken ct)
    {
        if (file == null || file.Length == 0)
        {
            return BadRequest("No file provided or file is empty.");
        }

        var originalName = Path.GetFileName(file.FileName);
        var safeExt = Path.GetExtension(originalName).ToLowerInvariant();

        var allowed = new HashSet<string> { ".jpg", ".jpeg", ".png", ".webp" };
        if (!allowed.Contains(safeExt))
        {
            return BadRequest("Unsupported image format.");
        }

        var uniqueFileName = $"{Guid.NewGuid():N}{safeExt}";
        var physicalPath = Path.Combine(_uploadFolder, uniqueFileName);

        await using (var stream = System.IO.File.Create(physicalPath))
        {
            await file.CopyToAsync(stream, ct);
        }

        var relativeUrl = $"/uploads/{uniqueFileName}";
        var absoluteUrl = $"{Request.Scheme}://{Request.Host}{relativeUrl}";

        var asset = new MediaAsset
        {
            Url = absoluteUrl,
            Filename = originalName,
            ContentType = file.ContentType,
            SizeBytes = file.Length,
            CreatedAt = DateTime.UtcNow,
            Tags = Array.Empty<string>()
        };

        await _mediaRepository.CreateAsync(asset);

        return Ok(asset);
    }

    [HttpPost("import")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> ImportExisting([FromBody] ImportMediaRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.RelativeUrl))
        {
            return BadRequest("relativeUrl is required.");
        }

        var fileName = Path.GetFileName(request.RelativeUrl);
        var physicalPath = Path.Combine(_uploadFolder, fileName);
        if (!System.IO.File.Exists(physicalPath))
        {
            return NotFound("File not found.");
        }

        var fileInfo = new FileInfo(physicalPath);
        var asset = new MediaAsset
        {
            Url = $"{Request.Scheme}://{Request.Host}/uploads/{fileName}",
            Filename = fileInfo.Name,
            ContentType = request.ContentType ?? "image",
            SizeBytes = fileInfo.Length,
            CreatedAt = fileInfo.CreationTimeUtc,
            Tags = Array.Empty<string>()
        };

        await _mediaRepository.CreateAsync(asset);
        return Ok(asset);
    }

    [HttpGet]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> ListMedia([FromQuery] string search = "", [FromQuery] int page = 1, [FromQuery] int pageSize = 24)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 100 ? 24 : pageSize;

        var (items, total) = await _mediaRepository.ListAsync(search, page, pageSize);
        return Ok(new { items, total });
    }

    [HttpGet("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> GetMedia(string id)
    {
        var asset = await _mediaRepository.GetByIdAsync(id);
        if (asset == null)
        {
            return NotFound();
        }
        return Ok(asset);
    }

    [HttpGet("{id}/usage")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> GetUsage(string id)
    {
        var games = await _gameRepository.GetByCoverMediaIdAsync(id);
        var usedBy = games.Select(game => new { gameId = game.Id, gameTitle = game.Name }).ToList();
        return Ok(new { usedBy, count = usedBy.Count });
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> DeleteMedia(string id, [FromQuery] bool force = false)
    {
        var asset = await _mediaRepository.GetByIdAsync(id);
        if (asset == null)
        {
            return NotFound();
        }

        var usage = await _gameRepository.GetByCoverMediaIdAsync(id);
        if (usage.Any() && !force)
        {
            return Ok(new { deleted = false, usedByCount = usage.Count });
        }

        if (usage.Any() && force)
        {
            foreach (var game in usage)
            {
                game.CoverMediaId = null;
                await _gameRepository.UpdateAsync(game.Id, game);
            }
        }

        var fileName = Path.GetFileName(new Uri(asset.Url).AbsolutePath);
        var physicalPath = Path.Combine(_uploadFolder, fileName);
        if (System.IO.File.Exists(physicalPath))
        {
            System.IO.File.Delete(physicalPath);
        }

        await _mediaRepository.DeleteAsync(id);
        return Ok(new { deleted = true, usedByCount = usage.Count });
    }
}

public record ImportMediaRequest(string RelativeUrl, string ContentType);
