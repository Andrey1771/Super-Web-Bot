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
    private const int TitleMinLength = 10;
    private const int TitleMaxLength = 80;
    private const int ExcerptMaxLength = 160;
    private const int TagsMaxCount = 8;
    private const int TagMinLength = 2;
    private const int TagMaxLength = 24;
    private const long CoverMaxSizeBytes = 5 * 1024 * 1024;
    private const int CoverMinWidth = 1000;
    private const int CoverMinHeight = 560;
    private static readonly HashSet<string> AllowedCoverTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg",
        "image/png",
        "image/webp"
    };

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

        var titleValidation = ValidateTitle(request.Title);
        if (!string.IsNullOrWhiteSpace(titleValidation))
        {
            return BadRequest(titleValidation);
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

        var normalizedExcerpt = NormalizeExcerpt(request.Excerpt, request.ContentMarkdown, request.ContentHtml);
        var excerptValidation = ValidateExcerpt(normalizedExcerpt);
        if (!string.IsNullOrWhiteSpace(excerptValidation))
        {
            return BadRequest(excerptValidation);
        }

        var tagsValidation = ValidateTags(request.Tags);
        if (!string.IsNullOrWhiteSpace(tagsValidation))
        {
            return BadRequest(tagsValidation);
        }

        var coverValidation = await ValidateCoverAsync(request.CoverAssetId);
        if (!string.IsNullOrWhiteSpace(coverValidation))
        {
            return BadRequest(coverValidation);
        }

        var now = DateTime.UtcNow;
        var post = new BlogPost
        {
            Title = request.Title,
            Slug = slug,
            Excerpt = normalizedExcerpt,
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
            Topics = request.Topics ?? Array.Empty<string>(),
            ReadingTime = request.ReadingTime,
            CurrentVersionId = string.Empty,
            ViewCount = 0,
            EditorScore = request.EditorScore ?? 0,
            Featured = request.Featured ?? false
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
            Excerpt = normalizedExcerpt,
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

        var titleValidation = ValidateTitle(request.Title);
        if (!string.IsNullOrWhiteSpace(titleValidation))
        {
            return BadRequest(titleValidation);
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

        var normalizedExcerpt = NormalizeExcerpt(request.Excerpt, request.ContentMarkdown, request.ContentHtml);
        var excerptValidation = ValidateExcerpt(normalizedExcerpt);
        if (!string.IsNullOrWhiteSpace(excerptValidation))
        {
            return BadRequest(excerptValidation);
        }

        var tagsValidation = ValidateTags(request.Tags);
        if (!string.IsNullOrWhiteSpace(tagsValidation))
        {
            return BadRequest(tagsValidation);
        }

        var coverValidation = await ValidateCoverAsync(request.CoverAssetId);
        if (!string.IsNullOrWhiteSpace(coverValidation))
        {
            return BadRequest(coverValidation);
        }

        var versions = await _blogRepository.GetVersionsAsync(post.Id);
        var nextVersion = versions.Count == 0 ? 1 : versions.Max(item => item.VersionNumber) + 1;

        post.Title = request.Title;
        post.Slug = slug;
        post.Excerpt = normalizedExcerpt;
        post.CoverAssetId = request.CoverAssetId;
        post.CoverUrl = await ResolveCoverUrlAsync(request.CoverAssetId, request.CoverUrl);
        post.Status = NormalizeStatus(request.Status);
        post.PublishedAt = ResolvePublishedAt(request.Status, request.PublishedAt, post.PublishedAt);
        post.ScheduledAt = request.ScheduledAt;
        post.Tags = request.Tags ?? Array.Empty<string>();
        post.Topics = request.Topics ?? Array.Empty<string>();
        post.EditorScore = request.EditorScore ?? post.EditorScore;
        post.Featured = request.Featured ?? post.Featured;
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
            Excerpt = normalizedExcerpt,
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

    private static string ValidateTitle(string title)
    {
        var trimmed = title?.Trim() ?? string.Empty;
        if (trimmed.Length < TitleMinLength || trimmed.Length > TitleMaxLength)
        {
            return $"Title must be between {TitleMinLength} and {TitleMaxLength} characters.";
        }
        return string.Empty;
    }

    private static string ValidateExcerpt(string excerpt)
    {
        if (!string.IsNullOrWhiteSpace(excerpt) && excerpt.Length > ExcerptMaxLength)
        {
            return $"Excerpt must be {ExcerptMaxLength} characters or less.";
        }
        return string.Empty;
    }

    private static string ValidateTags(string[] tags)
    {
        if (tags == null)
        {
            return string.Empty;
        }

        if (tags.Length > TagsMaxCount)
        {
            return $"No more than {TagsMaxCount} tags are allowed.";
        }

        foreach (var tag in tags)
        {
            if (string.IsNullOrWhiteSpace(tag))
            {
                continue;
            }

            var length = tag.Trim().Length;
            if (length < TagMinLength || length > TagMaxLength)
            {
                return $"Tags must be between {TagMinLength} and {TagMaxLength} characters.";
            }
        }

        return string.Empty;
    }

    private async Task<string> ValidateCoverAsync(string coverAssetId)
    {
        if (string.IsNullOrWhiteSpace(coverAssetId))
        {
            return string.Empty;
        }

        var asset = await _mediaRepository.GetByIdAsync(coverAssetId);
        if (asset == null)
        {
            return "Cover asset not found.";
        }

        if (!string.IsNullOrWhiteSpace(asset.ContentType) && !AllowedCoverTypes.Contains(asset.ContentType))
        {
            return "Cover image must be a JPG, PNG, or WebP file.";
        }

        if (asset.SizeBytes > CoverMaxSizeBytes)
        {
            return "Cover image must be 5MB or smaller.";
        }

        if (!asset.Width.HasValue || !asset.Height.HasValue)
        {
            return "Cover image dimensions are missing.";
        }

        if (asset.Width.Value < CoverMinWidth || asset.Height.Value < CoverMinHeight)
        {
            return $"Cover image must be at least {CoverMinWidth}x{CoverMinHeight}px.";
        }

        return string.Empty;
    }

    private static string NormalizeExcerpt(string excerpt, string contentMarkdown, string contentHtml)
    {
        var normalized = excerpt?.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            var source = !string.IsNullOrWhiteSpace(contentMarkdown)
                ? StripMarkdown(contentMarkdown)
                : StripHtml(contentHtml);
            normalized = source?.Trim() ?? string.Empty;
        }

        normalized = Regex.Replace(normalized, @"\s+", " ").Trim();
        if (normalized.Length > ExcerptMaxLength)
        {
            normalized = normalized.Substring(0, ExcerptMaxLength).Trim();
        }

        return normalized;
    }

    private static string StripMarkdown(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
        {
            return string.Empty;
        }

        var withoutImages = Regex.Replace(markdown, @"!\[[^\]]*\]\([^\)]*\)", " ");
        var withoutLinks = Regex.Replace(withoutImages, @"\[[^\]]*\]\([^\)]*\)", " ");
        var withoutFormatting = Regex.Replace(withoutLinks, @"[#>*_`~\-]", " ");
        return withoutFormatting;
    }

    private static string StripHtml(string html)
    {
        if (string.IsNullOrWhiteSpace(html))
        {
            return string.Empty;
        }

        return Regex.Replace(html, "<.*?>", " ");
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
    public string[]? Topics { get; set; }
    public string? AuthorId { get; set; }
    public string? AuthorName { get; set; }
    public int? ReadingTime { get; set; }
    public int? EditorScore { get; set; }
    public bool? Featured { get; set; }
    public string? ChangeNote { get; set; }
}

public class RestoreBlogPostRequest
{
    public string VersionId { get; set; }
    public string ChangeNote { get; set; }
    public string RestoredBy { get; set; }
}
