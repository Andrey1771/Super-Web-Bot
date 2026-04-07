using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using System.Security.Claims;
using System.Linq;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/blog/posts")]
public class BlogController : ControllerBase
{
    private readonly IBlogRepository _blogRepository;
    private readonly IBlogRecommendationsService _blogRecommendationsService;
    private readonly IBlogPostUniqueViewRepository _blogPostUniqueViewRepository;
    private readonly IBlogViewSettingsRepository _blogViewSettingsRepository;

    public BlogController(
        IBlogRepository blogRepository,
        IBlogRecommendationsService blogRecommendationsService,
        IBlogPostUniqueViewRepository blogPostUniqueViewRepository,
        IBlogViewSettingsRepository blogViewSettingsRepository)
    {
        _blogRepository = blogRepository;
        _blogRecommendationsService = blogRecommendationsService;
        _blogPostUniqueViewRepository = blogPostUniqueViewRepository;
        _blogViewSettingsRepository = blogViewSettingsRepository;
    }

    [HttpGet]
    public async Task<IActionResult> GetPosts(
        [FromQuery] string status = "PUBLISHED",
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 12,
        [FromQuery] string tag = "",
        [FromQuery] string search = "",
        [FromQuery] bool? featured = null)
    {
        var query = new BlogQueryParameters
        {
            Page = page,
            PageSize = pageSize,
            Tag = tag,
            Search = search,
            Status = status,
            Featured = featured
        };

        var (items, total) = await _blogRepository.GetPublicPagedAsync(query);
        var statsMap = await BuildStatsMapAsync(items.Select(item => item.Id));
        var list = items.Select(post => new
        {
            post.Id,
            post.Slug,
            post.Title,
            post.Excerpt,
            post.CoverUrl,
            post.Tags,
            post.PublishedAt,
            post.ReadingTime,
            post.Featured,
            ViewsCount = statsMap.TryGetValue(post.Id, out var stats) ? stats.ViewsCount : 0,
            CompletedReadsCount = statsMap.TryGetValue(post.Id, out stats) ? stats.CompletedReadsCount : 0
        });

        return Ok(new { items = list, total });
    }

    [HttpGet("{slug}")]
    public async Task<IActionResult> GetPostBySlug(string slug)
    {
        var post = await _blogRepository.GetBySlugAsync(slug);
        if (post == null || post.Status != "PUBLISHED")
        {
            return NotFound();
        }

        var version = await _blogRepository.GetVersionByIdAsync(post.Id, post.CurrentVersionId);
        var stats = await BuildStatsAsync(post.Id);
        return Ok(new
        {
            post = new
            {
                post.Id,
                post.Slug,
                post.Title,
                post.Excerpt,
                post.CoverUrl,
                ImageUrl = post.CoverUrl,
                post.Status,
                post.PublishedAt,
                post.ScheduledAt,
                post.CreatedAt,
                post.UpdatedAt,
                post.AuthorId,
                post.AuthorName,
                post.Tags,
                post.Topics,
                post.ReadingTime,
                post.CurrentVersionId,
                post.EditorScore,
                post.Featured,
                post.BlogHomeFeatured,
                ViewCount = stats.ViewsCount,
                CompletedReadsCount = stats.CompletedReadsCount
            },
            version,
            stats
        });
    }

    [HttpGet("{slug}/stats")]
    public async Task<IActionResult> GetPostStats(string slug)
    {
        var post = await _blogRepository.GetBySlugAsync(slug);
        if (post == null || post.Status != "PUBLISHED")
        {
            return NotFound();
        }

        var stats = await BuildStatsAsync(post.Id);
        return Ok(stats);
    }

    [HttpPost("{slug}/track-view")]
    public async Task<IActionResult> TrackView(string slug, [FromBody] BlogTrackRequest request)
    {
        return await TrackEventBySlug(slug, request, "POST_OPEN");
    }

    [HttpPost("{slug}/register-unique-view")]
    public async Task<IActionResult> RegisterUniqueView(string slug, [FromBody] RegisterUniqueViewRequest request)
    {
        var post = await _blogRepository.GetBySlugAsync(slug);
        if (post == null || post.Status != "PUBLISHED")
        {
            return NotFound();
        }

        request ??= new RegisterUniqueViewRequest();
        if (!request.IsVisible || !request.HasInteraction || request.ActiveDwellMs < 5000)
        {
            return BadRequest("View validation requirements are not met.");
        }

        var userId = GetCurrentUserId();
        var viewerKey = BuildViewerKey(userId, request.AnonId);
        if (string.IsNullOrWhiteSpace(viewerKey))
        {
            return BadRequest("Identity is required.");
        }

        var ipHash = ComputeHash(GetClientIpAddress());
        var userAgentHash = ComputeHash(Request.Headers.UserAgent.ToString());
        if (IsIpRateLimited(ipHash))
        {
            return StatusCode(StatusCodes.Status429TooManyRequests, "Too many view registrations.");
        }

        var existing = await _blogPostUniqueViewRepository.GetByPostAndViewerKeyAsync(post.Id, viewerKey);
        if (existing == null)
        {
            var now = DateTime.UtcNow;
            await _blogPostUniqueViewRepository.CreateAsync(new BlogPostUniqueView
            {
                PostId = post.Id,
                ViewerKey = viewerKey,
                UserId = userId,
                AnonId = request.AnonId,
                IsGuest = string.IsNullOrWhiteSpace(userId),
                FirstViewedAt = now,
                LastViewedAt = now,
                FirstSessionId = request.SessionId,
                LastSessionId = request.SessionId,
                UserAgentHash = userAgentHash,
                IpHash = ipHash,
                IsExcludedFromPublicCounts = false,
                Source = "blog-detail",
                CreatedAt = now,
                UpdatedAt = now
            });
        }
        else
        {
            await _blogPostUniqueViewRepository.TouchAsync(existing.Id, DateTime.UtcNow, request.SessionId, userAgentHash, ipHash);
        }

        var stats = await BuildStatsAsync(post.Id);
        return Ok(stats);
    }

    [HttpPost("{slug}/track-read")]
    public async Task<IActionResult> TrackRead(string slug, [FromBody] BlogTrackRequest request)
    {
        return await TrackEventBySlug(slug, request, "POST_READ_COMPLETE");
    }

    private async Task<IActionResult> TrackEventBySlug(string slug, BlogTrackRequest request, string eventType)
    {
        var post = await _blogRepository.GetBySlugAsync(slug);
        if (post == null || post.Status != "PUBLISHED")
        {
            return NotFound();
        }

        request ??= new BlogTrackRequest();
        var userId = GetCurrentUserId();
        var actorKey = BuildActorKey(userId, request.AnonId, request.SessionKey);
        if (string.IsNullOrWhiteSpace(actorKey))
        {
            return BadRequest("Identity is required.");
        }

        var fromUtc = DateTime.UnixEpoch;
        var events = await _blogRecommendationsService.GetEventsByPostAsync(post.Id, fromUtc);
        var alreadyTracked = events.Any(item =>
            string.Equals(item.EventType, eventType, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(BuildActorKey(item.UserId, item.AnonId, item.SessionId), actorKey, StringComparison.Ordinal));

        if (alreadyTracked)
        {
            var dedupedStats = await BuildStatsAsync(post.Id);
            return Ok(dedupedStats);
        }

        await _blogRecommendationsService.TrackEventAsync(new BlogEvent
        {
            PostId = post.Id,
            EventType = eventType,
            Timestamp = DateTime.UtcNow,
            UserId = userId,
            AnonId = request.AnonId,
            SessionId = request.SessionKey
        });

        var stats = await BuildStatsAsync(post.Id);
        return Ok(stats);
    }

    private async Task<BlogPostStatsResponse> BuildStatsAsync(string postId)
    {
        var settings = await _blogViewSettingsRepository.GetAsync();
        var includeGuestViews = settings?.CountGuestViewsInPublicCounts ?? true;
        var views = await _blogPostUniqueViewRepository.CountPublicViewsByPostIdAsync(postId, includeGuestViews);

        var events = await _blogRecommendationsService.GetEventsByPostAsync(postId, DateTime.UtcNow.AddYears(-3));
        var reads = events
            .Where(item => string.Equals(item.EventType, "POST_READ_COMPLETE", StringComparison.OrdinalIgnoreCase))
            .Select(item => BuildActorKey(item.UserId, item.AnonId, item.SessionId))
            .Where(key => !string.IsNullOrWhiteSpace(key))
            .Distinct(StringComparer.Ordinal)
            .Count();

        return new BlogPostStatsResponse
        {
            PostId = postId,
            ViewsCount = views,
            CompletedReadsCount = reads,
            UpdatedAt = DateTime.UtcNow
        };
    }

    private async Task<Dictionary<string, BlogPostStatsResponse>> BuildStatsMapAsync(IEnumerable<string> postIds)
    {
        var ids = postIds.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var settings = await _blogViewSettingsRepository.GetAsync();
        var includeGuestViews = settings?.CountGuestViewsInPublicCounts ?? true;
        var viewsMap = await _blogPostUniqueViewRepository.CountPublicViewsByPostIdsAsync(ids, includeGuestViews);

        var map = new Dictionary<string, BlogPostStatsResponse>(StringComparer.OrdinalIgnoreCase);
        foreach (var postId in ids)
        {
            var stats = await BuildStatsAsync(postId);
            if (viewsMap.TryGetValue(postId, out var viewCount))
            {
                stats.ViewsCount = viewCount;
            }
            map[postId] = stats;
        }
        return map;
    }

    private static string BuildViewerKey(string userId, string anonId)
    {
        if (!string.IsNullOrWhiteSpace(userId))
        {
            return $"u:{userId}";
        }
        if (!string.IsNullOrWhiteSpace(anonId))
        {
            return $"a:{anonId}";
        }
        return string.Empty;
    }

    private static readonly Dictionary<string, DateTime> _ipRateLimitCache = new(StringComparer.Ordinal);
    private static readonly object _ipRateLimitSync = new();

    private static bool IsIpRateLimited(string ipHash)
    {
        if (string.IsNullOrWhiteSpace(ipHash))
        {
            return false;
        }

        lock (_ipRateLimitSync)
        {
            var now = DateTime.UtcNow;
            if (_ipRateLimitCache.TryGetValue(ipHash, out var last) && (now - last).TotalSeconds < 2)
            {
                return true;
            }
            _ipRateLimitCache[ipHash] = now;
            return false;
        }
    }

    private string GetClientIpAddress()
    {
        var forwarded = Request.Headers["X-Forwarded-For"].ToString();
        if (!string.IsNullOrWhiteSpace(forwarded))
        {
            return forwarded.Split(',')[0].Trim();
        }
        return HttpContext.Connection.RemoteIpAddress?.ToString() ?? string.Empty;
    }

    private static string ComputeHash(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        using var sha = System.Security.Cryptography.SHA256.Create();
        var bytes = System.Text.Encoding.UTF8.GetBytes(value.Trim());
        var hash = sha.ComputeHash(bytes);
        return Convert.ToHexString(hash);
    }

    private static string BuildActorKey(string userId, string anonId, string sessionKey)
    {
        if (!string.IsNullOrWhiteSpace(userId))
        {
            return $"u:{userId}";
        }
        if (!string.IsNullOrWhiteSpace(anonId))
        {
            return $"a:{anonId}";
        }
        if (!string.IsNullOrWhiteSpace(sessionKey))
        {
            return $"s:{sessionKey}";
        }
        return string.Empty;
    }

    private string GetCurrentUserId()
    {
        return User?.FindFirst("email")?.Value
               ?? User?.FindFirst(ClaimTypes.Email)?.Value
               ?? User?.FindFirst("preferred_username")?.Value
               ?? User?.FindFirst(ClaimTypes.NameIdentifier)?.Value
               ?? User?.FindFirst("sub")?.Value
               ?? string.Empty;
    }
}

public class BlogTrackRequest
{
    public string UserId { get; set; }
    public string AnonId { get; set; }
    public string SessionKey { get; set; }
}

public class BlogPostStatsResponse
{
    public string PostId { get; set; }
    public int ViewsCount { get; set; }
    public int CompletedReadsCount { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class RegisterUniqueViewRequest
{
    public string AnonId { get; set; }
    public string SessionId { get; set; }
    public bool IsVisible { get; set; }
    public bool HasInteraction { get; set; }
    public int ActiveDwellMs { get; set; }
}
