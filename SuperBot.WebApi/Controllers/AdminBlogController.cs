using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using System.Text.RegularExpressions;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/admin/blog/posts")]
[Authorize(Roles = "admin")]
public class AdminBlogController : ControllerBase
{
    private readonly IBlogRepository _blogRepository;
    private readonly IMediaAssetRepository _mediaRepository;

    public AdminBlogController(IBlogRepository blogRepository, IMediaAssetRepository mediaRepository)
    {
        _blogRepository = blogRepository;
        _mediaRepository = mediaRepository;
    }

    [HttpGet]
    public async Task<IActionResult> GetPosts(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string status = "",
        [FromQuery] string search = "",
        [FromQuery] string tag = "",
        [FromQuery] string sort = "updatedAt:desc")
    {
        var query = new BlogQueryParameters
        {
            Page = page,
            PageSize = pageSize,
            Status = status,
            Search = search,
            Tag = tag,
            Sort = sort
        };

        var (items, total) = await _blogRepository.GetPagedAsync(query);
        return Ok(new { items, total });
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetPost(string id)
    {
        var post = await _blogRepository.GetByIdAsync(id);
        if (post == null)
        {
            return NotFound();
        }

        var version = await _blogRepository.GetVersionByIdAsync(post.Id, post.CurrentVersionId);
        return Ok(new { post, version });
    }

    [HttpPost]
    public async Task<IActionResult> CreatePost([FromBody] SaveBlogPostRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Title))
        {
            return BadRequest("Title is required.");
        }

        var slug = string.IsNullOrWhiteSpace(request.Slug) ? GenerateSlug(request.Title) : GenerateSlug(request.Slug);
        if (string.IsNullOrWhiteSpace(slug))
        {
            return BadRequest("Slug is required.");
        }
        if (await _blogRepository.GetBySlugAsync(slug) != null)
        {
            return Conflict("Slug already exists.");
        }

        var now = DateTime.UtcNow;
        var post = new BlogPost
        {
            Title = request.Title,
            Slug = slug,
            Excerpt = request.Excerpt ?? "",
            CoverAssetId = request.CoverAssetId,
            CoverUrl = await ResolveCoverUrlAsync(request.CoverAssetId, request.CoverUrl),
            Status = NormalizeStatus(request.Status),
            PublishedAt = ResolvePublishedAt(request.Status, request.PublishedAt),
            ScheduledAt = request.ScheduledAt,
            CreatedAt = now,
            UpdatedAt = now,
            AuthorId = request.AuthorId,
            AuthorName = request.AuthorName,
            Tags = request.Tags ?? Array.Empty<string>(),
            ReadingTime = request.ReadingTime,
            CurrentVersionId = string.Empty,
            ViewCount = 0
        };

        var scheduleError = ValidateSchedule(post);
        if (!string.IsNullOrWhiteSpace(scheduleError))
        {
            return BadRequest(scheduleError);
        }

        var version = new BlogPostVersion
        {
            PostId = post.Id,
            VersionNumber = 1,
            Title = request.Title,
            Excerpt = request.Excerpt ?? "",
            ContentMarkdown = request.ContentMarkdown ?? "",
            ContentHtml = request.ContentHtml ?? "",
            CoverAssetId = request.CoverAssetId,
            CreatedAt = now,
            CreatedBy = request.AuthorName,
            ChangeNote = request.ChangeNote ?? "Initial version"
        };

        await _blogRepository.CreateAsync(post, version);

        return Ok(post);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdatePost(string id, [FromBody] SaveBlogPostRequest request)
    {
        var post = await _blogRepository.GetByIdAsync(id);
        if (post == null)
        {
            return NotFound();
        }

        if (string.IsNullOrWhiteSpace(request.Title))
        {
            return BadRequest("Title is required.");
        }

        var slug = string.IsNullOrWhiteSpace(request.Slug) ? GenerateSlug(request.Title) : GenerateSlug(request.Slug);
        if (string.IsNullOrWhiteSpace(slug))
        {
            return BadRequest("Slug is required.");
        }
        var existingSlug = await _blogRepository.GetBySlugAsync(slug);
        if (existingSlug != null && existingSlug.Id != post.Id)
        {
            return Conflict("Slug already exists.");
        }

        var versions = await _blogRepository.GetVersionsAsync(post.Id);
        var nextVersion = versions.Count == 0 ? 1 : versions.Max(item => item.VersionNumber) + 1;

        post.Title = request.Title;
        post.Slug = slug;
        post.Excerpt = request.Excerpt ?? "";
        post.CoverAssetId = request.CoverAssetId;
        post.CoverUrl = await ResolveCoverUrlAsync(request.CoverAssetId, request.CoverUrl);
        post.Status = NormalizeStatus(request.Status);
        post.PublishedAt = ResolvePublishedAt(request.Status, request.PublishedAt, post.PublishedAt);
        post.ScheduledAt = request.ScheduledAt;
        post.Tags = request.Tags ?? Array.Empty<string>();
        post.UpdatedAt = DateTime.UtcNow;

        var scheduleError = ValidateSchedule(post);
        if (!string.IsNullOrWhiteSpace(scheduleError))
        {
            return BadRequest(scheduleError);
        }

        var version = new BlogPostVersion
        {
            PostId = post.Id,
            VersionNumber = nextVersion,
            Title = request.Title,
            Excerpt = request.Excerpt ?? "",
            ContentMarkdown = request.ContentMarkdown ?? "",
            ContentHtml = request.ContentHtml ?? "",
            CoverAssetId = request.CoverAssetId,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = request.AuthorName,
            ChangeNote = request.ChangeNote ?? "Updated"
        };

        await _blogRepository.UpdateAsync(post, version);

        return Ok(post);
    }

    [HttpGet("{id}/versions")]
    public async Task<IActionResult> GetVersions(string id)
    {
        var post = await _blogRepository.GetByIdAsync(id);
        if (post == null)
        {
            return NotFound();
        }

        var versions = await _blogRepository.GetVersionsAsync(id);
        var list = versions.Select(version => new
        {
            version.Id,
            version.VersionNumber,
            version.CreatedAt,
            version.CreatedBy,
            version.ChangeNote
        });
        return Ok(list);
    }

    [HttpGet("{id}/versions/{versionId}")]
    public async Task<IActionResult> GetVersion(string id, string versionId)
    {
        var version = await _blogRepository.GetVersionByIdAsync(id, versionId);
        if (version == null)
        {
            return NotFound();
        }
        return Ok(version);
    }

    [HttpPost("{id}/restore")]
    public async Task<IActionResult> RestoreVersion(string id, [FromBody] RestoreBlogPostRequest request)
    {
        var post = await _blogRepository.GetByIdAsync(id);
        if (post == null)
        {
            return NotFound();
        }

        var version = await _blogRepository.GetVersionByIdAsync(id, request.VersionId);
        if (version == null)
        {
            return NotFound();
        }

        var versions = await _blogRepository.GetVersionsAsync(post.Id);
        var nextVersion = versions.Count == 0 ? 1 : versions.Max(item => item.VersionNumber) + 1;

        var restored = new BlogPostVersion
        {
            PostId = post.Id,
            VersionNumber = nextVersion,
            Title = version.Title,
            Excerpt = version.Excerpt,
            ContentMarkdown = version.ContentMarkdown,
            ContentHtml = version.ContentHtml,
            CoverAssetId = version.CoverAssetId,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = request.RestoredBy,
            ChangeNote = request.ChangeNote ?? $"Restored version {version.VersionNumber}"
        };

        post.Title = version.Title;
        post.Excerpt = version.Excerpt;
        post.CoverAssetId = version.CoverAssetId;
        post.UpdatedAt = DateTime.UtcNow;
        await _blogRepository.UpdateAsync(post, restored);

        return Ok(post);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> ArchivePost(string id)
    {
        var post = await _blogRepository.GetByIdAsync(id);
        if (post == null)
        {
            return NotFound();
        }

        post.Status = "ARCHIVED";
        post.UpdatedAt = DateTime.UtcNow;
        await _blogRepository.UpdateAsync(post, new BlogPostVersion
        {
            PostId = post.Id,
            VersionNumber = (await _blogRepository.GetVersionsAsync(post.Id)).Count + 1,
            Title = post.Title,
            Excerpt = post.Excerpt,
            ContentMarkdown = string.Empty,
            ContentHtml = string.Empty,
            CoverAssetId = post.CoverAssetId,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = post.AuthorName,
            ChangeNote = "Archived"
        });

        return Ok(post);
    }

    private static string NormalizeStatus(string status)
    {
        if (string.IsNullOrWhiteSpace(status))
        {
            return "DRAFT";
        }

        var normalized = status.Trim().ToUpperInvariant();
        return normalized switch
        {
            "PUBLISHED" => "PUBLISHED",
            "SCHEDULED" => "SCHEDULED",
            "ARCHIVED" => "ARCHIVED",
            _ => "DRAFT"
        };
    }

    private static DateTime? ResolvePublishedAt(string status, DateTime? publishedAt, DateTime? existing = null)
    {
        if (NormalizeStatus(status) != "PUBLISHED")
        {
            return existing;
        }

        return publishedAt ?? DateTime.UtcNow;
    }

    private static string ValidateSchedule(BlogPost post)
    {
        if (post.Status == "SCHEDULED" && (!post.ScheduledAt.HasValue || post.ScheduledAt <= DateTime.UtcNow))
        {
            return "Scheduled posts require a future scheduledAt value.";
        }
        return null;
    }

    private async Task<string> ResolveCoverUrlAsync(string coverAssetId, string fallbackUrl)
    {
        if (!string.IsNullOrWhiteSpace(coverAssetId))
        {
            var asset = await _mediaRepository.GetByIdAsync(coverAssetId);
            return asset?.Url ?? fallbackUrl ?? string.Empty;
        }
        return fallbackUrl ?? string.Empty;
    }

    private static string GenerateSlug(string value)
    {
        var slug = value.ToLowerInvariant();
        slug = Regex.Replace(slug, @"[^\p{L}\p{N}\s-]", "");
        slug = Regex.Replace(slug, @"\s+", "-");
        slug = Regex.Replace(slug, @"-+", "-");
        return slug.Trim('-');
    }
}

public class SaveBlogPostRequest
{
    public string? Title { get; set; }
    public string? Slug { get; set; }
    public string? Excerpt { get; set; }
    public string? ContentMarkdown { get; set; }
    public string? ContentHtml { get; set; }
    public string? CoverAssetId { get; set; }
    public string? CoverUrl { get; set; }
    public string? Status { get; set; }
    public DateTime? PublishedAt { get; set; }
    public DateTime? ScheduledAt { get; set; }
    public string[]? Tags { get; set; }
    public string? AuthorId { get; set; }
    public string? AuthorName { get; set; }
    public int? ReadingTime { get; set; }
    public string? ChangeNote { get; set; }
}

public class RestoreBlogPostRequest
{
    public string VersionId { get; set; }
    public string ChangeNote { get; set; }
    public string RestoredBy { get; set; }
}
