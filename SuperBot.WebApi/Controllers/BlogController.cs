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

    public BlogController(IBlogRepository blogRepository, IBlogRecommendationsService blogRecommendationsService)
    {
        _blogRepository = blogRepository;
        _blogRecommendationsService = blogRecommendationsService;
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
        var events = await _blogRecommendationsService.GetEventsByPostAsync(postId, DateTime.UtcNow.AddYears(-3));
        var views = events
            .Where(item => string.Equals(item.EventType, "POST_OPEN", StringComparison.OrdinalIgnoreCase))
            .Select(item => BuildActorKey(item.UserId, item.AnonId, item.SessionId))
            .Where(key => !string.IsNullOrWhiteSpace(key))
            .Distinct(StringComparer.Ordinal)
            .Count();

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
        var map = new Dictionary<string, BlogPostStatsResponse>(StringComparer.OrdinalIgnoreCase);
        foreach (var postId in postIds.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            map[postId] = await BuildStatsAsync(postId);
        }
        return map;
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
