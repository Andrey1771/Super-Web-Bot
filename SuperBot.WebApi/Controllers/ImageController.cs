using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace SuperBot.WebApi.Controllers;

[Route("api/images")]
[ApiController]
public class ImageController : ControllerBase
{
    private readonly string _uploadFolder;

    public ImageController(IWebHostEnvironment env)
    {
        _uploadFolder = Path.Combine(env.WebRootPath, "uploads");
        if (!Directory.Exists(_uploadFolder))
        {
            Directory.CreateDirectory(_uploadFolder);
        }
    }

    [HttpPost]
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

        return Ok(new
        {
            fileName = uniqueFileName,
            relativeUrl,
            url = absoluteUrl
        });
    }

    [HttpDelete("{fileName}")]
    [Authorize(Roles = "admin")]
    public IActionResult DeleteImage([FromRoute] string fileName)
    {
        var safeFileName = Path.GetFileName(fileName);
        var physicalPath = Path.Combine(_uploadFolder, safeFileName);

        if (!System.IO.File.Exists(physicalPath))
        {
            return NotFound("File not found.");
        }

        System.IO.File.Delete(physicalPath);
        return Ok(new { message = "File deleted successfully." });
    }

    [HttpGet]
    [Authorize(Roles = "admin")]
    public IActionResult ListImages()
    {
        var files = Directory.GetFiles(_uploadFolder)
            .Select(Path.GetFileName)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(fileName => new
            {
                fileName,
                relativeUrl = $"/uploads/{fileName}",
                url = $"{Request.Scheme}://{Request.Host}/uploads/{fileName}"
            })
            .ToList();

        return Ok(files);
    }
}
