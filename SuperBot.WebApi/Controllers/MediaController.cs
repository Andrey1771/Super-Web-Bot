using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using System.Security.Cryptography;
using System.Text.Json;
using System.Diagnostics;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/media")]
public class MediaController : ControllerBase
{
    private readonly string _uploadFolder;
    private readonly string _webRoot;
    private readonly string _videoThumbsFolder;
    private readonly IMediaAssetRepository _mediaRepository;
    private readonly IGameRepository _gameRepository;
    private const string VideoPlaceholderFileName = "video-placeholder.svg";
    private static readonly HashSet<string> AllowedImages = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".webp"
    };
    private static readonly HashSet<string> AllowedVideos = new(StringComparer.OrdinalIgnoreCase)
    {
        ".mp4", ".webm"
    };

    public MediaController(
        IWebHostEnvironment env,
        IMediaAssetRepository mediaRepository,
        IGameRepository gameRepository)
    {
        _mediaRepository = mediaRepository;
        _gameRepository = gameRepository;
        _webRoot = string.IsNullOrWhiteSpace(env.WebRootPath)
            ? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot")
            : env.WebRootPath;
        if (!Directory.Exists(_webRoot))
        {
            Directory.CreateDirectory(_webRoot);
        }
        _uploadFolder = Path.Combine(_webRoot, "uploads");
        _videoThumbsFolder = Path.Combine(_uploadFolder, "video-thumbs");
        if (!Directory.Exists(_uploadFolder))
        {
            Directory.CreateDirectory(_uploadFolder);
        }
        if (!Directory.Exists(_videoThumbsFolder))
        {
            Directory.CreateDirectory(_videoThumbsFolder);
        }
    }

    [HttpPost("upload")]
    [Authorize(Roles = "admin")]
    [RequestSizeLimit(300_000_000)]
    public async Task<IActionResult> UploadMedia(IFormFile file, CancellationToken ct)
    {
        if (file == null || file.Length == 0)
        {
            return BadRequest("No file provided or file is empty.");
        }

        var originalName = Path.GetFileName(file.FileName);
        var safeExt = Path.GetExtension(originalName);
        var isVideoContent = file.ContentType?.StartsWith("video/", StringComparison.OrdinalIgnoreCase) == true;
        var isImageContent = file.ContentType?.StartsWith("image/", StringComparison.OrdinalIgnoreCase) == true;
        var isImage = isImageContent || AllowedImages.Contains(safeExt);
        var isVideo = isVideoContent || AllowedVideos.Contains(safeExt);

        if (!isImage && !isVideo)
        {
            return BadRequest("Unsupported media format.");
        }

        if (isVideo && !AllowedVideos.Contains(safeExt))
        {
            return BadRequest("Unsupported video format. Allowed: mp4, webm.");
        }

        if (isImage && !AllowedImages.Contains(safeExt))
        {
            return BadRequest("Unsupported image format. Allowed: jpg, jpeg, png, webp.");
        }

        if (isImage && file.Length > 15_000_000)
        {
            return BadRequest("Image exceeds 15MB limit.");
        }

        if (isVideo && file.Length > 300_000_000)
        {
            return BadRequest("Video exceeds 300MB limit.");
        }

        var uniqueFileName = $"{Guid.NewGuid():N}{safeExt.ToLowerInvariant()}";
        var targetFolder = Path.Combine(_uploadFolder, isVideo ? "videos" : "images");
        if (!Directory.Exists(targetFolder))
        {
            Directory.CreateDirectory(targetFolder);
        }
        var physicalPath = Path.Combine(targetFolder, uniqueFileName);

        await using (var stream = System.IO.File.Create(physicalPath))
        {
            await file.CopyToAsync(stream, ct);
        }

        var hash = await MediaHashHelper.ComputeHashAsync(physicalPath, ct);
        var relativeUrl = isVideo ? $"/uploads/videos/{uniqueFileName}" : $"/uploads/images/{uniqueFileName}";
        var absoluteUrl = $"{Request.Scheme}://{Request.Host}{relativeUrl}";

        string thumbnailUrl = null;
        int? width = null;
        int? height = null;
        int? durationSec = null;

        if (isVideo)
        {
            try
            {
                if (IsFfprobeAvailable())
                {
                    var metadata = await TryReadVideoMetadataAsync(physicalPath, ct);
                    width = metadata.Width;
                    height = metadata.Height;
                    durationSec = metadata.DurationSeconds;
                }

                if (IsFfmpegAvailable())
                {
                    var thumbFileName = $"{Path.GetFileNameWithoutExtension(uniqueFileName)}.jpg";
                    var thumbPhysicalPath = Path.Combine(_videoThumbsFolder, thumbFileName);
                    var thumbRelativeUrl = $"/uploads/video-thumbs/{thumbFileName}";
                    await GenerateVideoThumbnailAsync(physicalPath, thumbPhysicalPath, durationSec, ct);
                    thumbnailUrl = $"{Request.Scheme}://{Request.Host}{thumbRelativeUrl}";
                }
                else
                {
                    thumbnailUrl = GetPlaceholderThumbnailUrl();
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Failed to generate video preview: {ex.Message}");
            }
        }

        var asset = new MediaAsset
        {
            Type = isVideo ? "video" : "image",
            Url = absoluteUrl,
            ThumbnailUrl = thumbnailUrl,
            Filename = originalName,
            ContentType = file.ContentType,
            SizeBytes = file.Length,
            HashSha256 = hash,
            Width = width,
            Height = height,
            DurationSec = durationSec,
            CreatedAt = DateTime.UtcNow,
            Tags = Array.Empty<string>()
        };

        await _mediaRepository.CreateAsync(asset);

        return Ok(asset);
    }

    [HttpPost("/api/admin/media/upload")]
    [Authorize(Roles = "admin")]
    [RequestSizeLimit(300_000_000)]
    public Task<IActionResult> UploadAdminMedia(IFormFile file, CancellationToken ct)
    {
        return UploadMedia(file, ct);
    }

    [HttpPost("import")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> ImportExisting([FromBody] ImportMediaRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.RelativeUrl))
        {
            return BadRequest("relativeUrl is required.");
        }

        var relativePath = request.RelativeUrl.TrimStart('/');
        var fileName = Path.GetFileName(relativePath);
        var physicalPath = Path.Combine(_webRoot, relativePath.Replace("/", Path.DirectorySeparatorChar.ToString()));
        if (!System.IO.File.Exists(physicalPath))
        {
            return NotFound("File not found.");
        }

        var fileInfo = new FileInfo(physicalPath);
        var hash = await MediaHashHelper.ComputeHashAsync(physicalPath, CancellationToken.None);
        var asset = new MediaAsset
        {
            Url = $"{Request.Scheme}://{Request.Host}/{relativePath}",
            Type = request.ContentType != null && request.ContentType.StartsWith("video/", StringComparison.OrdinalIgnoreCase)
                ? "video"
                : "image",
            Filename = fileInfo.Name,
            ContentType = request.ContentType ?? "image",
            SizeBytes = fileInfo.Length,
            HashSha256 = hash,
            CreatedAt = fileInfo.CreationTimeUtc,
            Tags = Array.Empty<string>()
        };

        await _mediaRepository.CreateAsync(asset);
        return Ok(asset);
    }

    [HttpGet]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> ListMedia([FromQuery] string search = "", [FromQuery] string type = "all", [FromQuery] int page = 1, [FromQuery] int pageSize = 24)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 100 ? 24 : pageSize;

        var (items, total) = await _mediaRepository.ListAsync(search, page, pageSize, type);
        return Ok(new { items, total });
    }

    [HttpGet("/api/admin/media")]
    [Authorize(Roles = "admin")]
    public Task<IActionResult> ListAdminMedia([FromQuery] string search = "", [FromQuery] string type = "all", [FromQuery] int page = 1, [FromQuery] int pageSize = 24)
    {
        return ListMedia(search, type, page, pageSize);
    }

    [HttpPost("{id}/generate-thumbnail")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> GenerateThumbnail(string id, CancellationToken ct)
    {
        var asset = await _mediaRepository.GetByIdAsync(id);
        if (asset == null)
        {
            return NotFound();
        }

        var isVideo = string.Equals(asset.Type, "video", StringComparison.OrdinalIgnoreCase)
            || (asset.ContentType?.StartsWith("video/", StringComparison.OrdinalIgnoreCase) == true);
        if (!isVideo)
        {
            return BadRequest("Preview generation is supported only for videos.");
        }

        if (!IsFfmpegAvailable())
        {
            return StatusCode(500, "FFmpeg not installed: cannot generate video preview.");
        }

        var physicalPath = GetPhysicalPathFromUrl(asset.Url);
        if (string.IsNullOrWhiteSpace(physicalPath) || !System.IO.File.Exists(physicalPath))
        {
            return NotFound("Video file not found.");
        }

        try
        {
            if (IsFfprobeAvailable())
            {
                var metadata = await TryReadVideoMetadataAsync(physicalPath, ct);
                asset.Width = metadata.Width;
                asset.Height = metadata.Height;
                asset.DurationSec = metadata.DurationSeconds;
            }

            var videoFileName = Path.GetFileNameWithoutExtension(physicalPath);
            var thumbFileName = $"{videoFileName}.jpg";
            var thumbPhysicalPath = Path.Combine(_videoThumbsFolder, thumbFileName);
            var thumbRelativeUrl = $"/uploads/video-thumbs/{thumbFileName}";

            await GenerateVideoThumbnailAsync(physicalPath, thumbPhysicalPath, asset.DurationSec, ct);
            asset.ThumbnailUrl = $"{Request.Scheme}://{Request.Host}{thumbRelativeUrl}";

            await _mediaRepository.UpdateAsync(id, asset);
            return Ok(asset);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Failed to generate video preview: {ex.Message}");
        }
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

        var relativePath = new Uri(asset.Url).AbsolutePath.TrimStart('/');
        var physicalPath = Path.Combine(_webRoot, relativePath.Replace("/", Path.DirectorySeparatorChar.ToString()));
        if (System.IO.File.Exists(physicalPath))
        {
            System.IO.File.Delete(physicalPath);
        }

        if (!string.IsNullOrWhiteSpace(asset.ThumbnailUrl))
        {
            var thumbRelativePath = new Uri(asset.ThumbnailUrl).AbsolutePath.TrimStart('/');
            var thumbPhysicalPath = Path.Combine(_webRoot, thumbRelativePath.Replace("/", Path.DirectorySeparatorChar.ToString()));
            if (System.IO.File.Exists(thumbPhysicalPath))
            {
                System.IO.File.Delete(thumbPhysicalPath);
            }
        }

        await _mediaRepository.DeleteAsync(id);
        return Ok(new { deleted = true, usedByCount = usage.Count });
    }

    private static bool IsFfmpegAvailable()
    {
        try
        {
            var psi = new ProcessStartInfo("ffmpeg", "-version")
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var process = Process.Start(psi);
            process?.WaitForExit(2000);
            return process?.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }

    private static bool IsFfprobeAvailable()
    {
        try
        {
            var psi = new ProcessStartInfo("ffprobe", "-version")
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var process = Process.Start(psi);
            process?.WaitForExit(2000);
            return process?.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }

    private static async Task<(int? Width, int? Height, int? DurationSeconds)> TryReadVideoMetadataAsync(string path, CancellationToken ct)
    {
        var psi = new ProcessStartInfo("ffprobe", $"-v error -select_streams v:0 -show_entries stream=width,height,duration -of json \"{path}\"")
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = Process.Start(psi);
        if (process == null)
        {
            return (null, null, null);
        }

        var output = await process.StandardOutput.ReadToEndAsync();
        await process.WaitForExitAsync(ct);
        if (process.ExitCode != 0 || string.IsNullOrWhiteSpace(output))
        {
            return (null, null, null);
        }

        try
        {
            using var doc = JsonDocument.Parse(output);
            var stream = doc.RootElement.GetProperty("streams")[0];
            int? width = stream.TryGetProperty("width", out var widthEl) ? widthEl.GetInt32() : null;
            int? height = stream.TryGetProperty("height", out var heightEl) ? heightEl.GetInt32() : null;
            int? duration = null;
            if (stream.TryGetProperty("duration", out var durationEl) && double.TryParse(durationEl.GetString(), out var durationValue))
            {
                duration = (int)Math.Round(durationValue);
            }
            return (width, height, duration);
        }
        catch
        {
            return (null, null, null);
        }
    }

    private static async Task GenerateVideoThumbnailAsync(string inputPath, string outputPath, int? durationSec, CancellationToken ct)
    {
        var seekSeconds = durationSec.HasValue && durationSec.Value <= 1 ? 0 : 1;
        var args = $"-y -ss 00:00:{seekSeconds:00} -i \"{inputPath}\" -frames:v 1 -q:v 2 \"{outputPath}\"";
        var psi = new ProcessStartInfo("ffmpeg", args)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = Process.Start(psi);
        if (process == null)
        {
            throw new InvalidOperationException("Unable to start ffmpeg.");
        }

        await process.WaitForExitAsync(ct);
        if (process.ExitCode != 0)
        {
            var error = await process.StandardError.ReadToEndAsync();
            throw new InvalidOperationException($"Failed to generate thumbnail: {error}");
        }
    }

    private string GetPhysicalPathFromUrl(string url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return null;
        }

        var path = url;
        if (Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            path = uri.AbsolutePath;
        }

        path = path.TrimStart('/');
        var relativePath = path.Replace("/", Path.DirectorySeparatorChar.ToString());
        return Path.Combine(_webRoot, relativePath);
    }

    private string GetPlaceholderThumbnailUrl()
    {
        var placeholderRelative = $"/uploads/video-thumbs/{VideoPlaceholderFileName}";
        return $"{Request.Scheme}://{Request.Host}{placeholderRelative}";
    }
}

public record ImportMediaRequest(string RelativeUrl, string ContentType);

internal static class MediaHashHelper
{
    public static async Task<string> ComputeHashAsync(string physicalPath, CancellationToken ct)
    {
        await using var stream = System.IO.File.OpenRead(physicalPath);
        using var sha256 = SHA256.Create();
        var hash = await sha256.ComputeHashAsync(stream, ct);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
