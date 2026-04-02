using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using System.Security.Claims;
using System.Text.Json.Serialization;
using System.Linq;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/blog/events")]
public class BlogEventsController : ControllerBase
{
    private readonly IBlogRecommendationsService _blogRecommendationsService;

    public BlogEventsController(IBlogRecommendationsService blogRecommendationsService)
    {
        _blogRecommendationsService = blogRecommendationsService;
    }

    [HttpPost]
    public async Task<IActionResult> TrackEvent([FromBody] BlogEventRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.PostId))
        {
            return BadRequest("PostId is required.");
        }

        if (!BlogEventRequest.AllowedEventTypes.Contains(request.EventType))
        {
            return BadRequest("Invalid event type.");
        }

        var userId = GetCurrentUserId();
        var normalizedEventType = request.EventType?.Trim().ToUpperInvariant() ?? string.Empty;

        if (normalizedEventType is "POST_OPEN" or "POST_READ_COMPLETE")
        {
            var dedupeFrom = DateTime.UtcNow.AddHours(-12);
            var recent = await _blogRecommendationsService.GetEventsByPostAsync(request.PostId, dedupeFrom);
            var actorKey = BuildActorKey(userId, request.AnonId, request.SessionId);
            var alreadyTracked = recent.Any(item =>
                string.Equals(item.EventType, normalizedEventType, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(BuildActorKey(item.UserId, item.AnonId, item.SessionId), actorKey, StringComparison.Ordinal));

            if (alreadyTracked)
            {
                return Ok(new { status = "deduped" });
            }
        }

        var blogEvent = new BlogEvent
        {
            PostId = request.PostId,
            EventType = normalizedEventType,
            Timestamp = request.Timestamp ?? DateTime.UtcNow,
            DwellMs = request.DwellMs,
            ScrollDepth = request.ScrollDepth,
            SessionId = request.SessionId,
            AnonId = request.AnonId,
            UserId = userId,
            Referrer = request.Referrer,
            Meta = request.Meta ?? new Dictionary<string, string>()
        };

        await _blogRecommendationsService.TrackEventAsync(blogEvent);

        return Ok(new { status = "ok" });
    }

    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary([FromQuery] string postIds, [FromQuery] string anonId = "")
    {
        var ids = (postIds ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(50)
            .ToList();

        if (ids.Count == 0)
        {
            return Ok(new { items = Array.Empty<object>() });
        }

        var fromUtc = DateTime.UtcNow.AddYears(-3);
        var userId = GetCurrentUserId();
        var items = new List<object>();

        foreach (var postId in ids)
        {
            var events = await _blogRecommendationsService.GetEventsByPostAsync(postId, fromUtc);
            var summary = BuildSummaryForPost(events, userId, anonId);
            items.Add(new
            {
                postId,
                viewsCount = summary.ViewsCount,
                completedReadsCount = summary.CompletedReadsCount,
                reactions = summary.ReactionCounts,
                totalReactions = summary.TotalReactions,
                myReaction = summary.MyReaction
            });
        }

        return Ok(new { items });
    }

    [HttpPost("reaction")]
    public async Task<IActionResult> SetReaction([FromBody] BlogReactionRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.PostId))
        {
            return BadRequest("PostId is required.");
        }

        var reaction = request.Reaction?.Trim();
        if (string.IsNullOrWhiteSpace(reaction))
        {
            return BadRequest("Reaction is required.");
        }

        if (!BlogReactionRequest.AllowedReactions.Contains(reaction))
        {
            return BadRequest("Unsupported reaction.");
        }

        var userId = GetCurrentUserId();
        var actorKey = BuildActorKey(userId, request.AnonId, request.SessionId);
        if (string.IsNullOrWhiteSpace(actorKey))
        {
            return BadRequest("Identity is required.");
        }

        var fromUtc = DateTime.UtcNow.AddYears(-3);
        var events = await _blogRecommendationsService.GetEventsByPostAsync(request.PostId, fromUtc);
        var currentReaction = GetCurrentReaction(events, actorKey);
        var eventType = string.Equals(currentReaction, reaction, StringComparison.Ordinal) ? "POST_REACTION_REMOVE" : "POST_REACTION_SET";

        var blogEvent = new BlogEvent
        {
            PostId = request.PostId,
            EventType = eventType,
            Timestamp = DateTime.UtcNow,
            SessionId = request.SessionId,
            AnonId = request.AnonId,
            UserId = userId,
            Meta = new Dictionary<string, string> { ["reaction"] = reaction }
        };

        await _blogRecommendationsService.TrackEventAsync(blogEvent);
        var updated = await _blogRecommendationsService.GetEventsByPostAsync(request.PostId, fromUtc);
        var summary = BuildSummaryForPost(updated, userId, request.AnonId);

        return Ok(new
        {
            postId = request.PostId,
            viewsCount = summary.ViewsCount,
            completedReadsCount = summary.CompletedReadsCount,
            reactions = summary.ReactionCounts,
            totalReactions = summary.TotalReactions,
            myReaction = summary.MyReaction
        });
    }

    private static string BuildActorKey(string userId, string anonId, string sessionId)
    {
        if (!string.IsNullOrWhiteSpace(userId))
        {
            return $"u:{userId}";
        }

        if (!string.IsNullOrWhiteSpace(anonId))
        {
            return $"a:{anonId}";
        }

        if (!string.IsNullOrWhiteSpace(sessionId))
        {
            return $"s:{sessionId}";
        }

        return string.Empty;
    }

    private static string GetReactionFromMeta(BlogEvent blogEvent)
    {
        if (blogEvent.Meta == null)
        {
            return string.Empty;
        }

        return blogEvent.Meta.TryGetValue("reaction", out var value) ? value : string.Empty;
    }

    private static string GetCurrentReaction(IReadOnlyList<BlogEvent> events, string actorKey)
    {
        return events
            .Where(item => string.Equals(BuildActorKey(item.UserId, item.AnonId, item.SessionId), actorKey, StringComparison.Ordinal))
            .OrderByDescending(item => item.Timestamp)
            .Select(item =>
            {
                if (string.Equals(item.EventType, "POST_REACTION_REMOVE", StringComparison.OrdinalIgnoreCase))
                {
                    return string.Empty;
                }
                return GetReactionFromMeta(item);
            })
            .FirstOrDefault(reaction => reaction != null) ?? string.Empty;
    }

    private static BlogEngagementSummary BuildSummaryForPost(IReadOnlyList<BlogEvent> events, string userId, string anonId)
    {
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

        var latestByActor = events
            .Where(item =>
                string.Equals(item.EventType, "POST_REACTION_SET", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(item.EventType, "POST_REACTION_REMOVE", StringComparison.OrdinalIgnoreCase))
            .GroupBy(item => BuildActorKey(item.UserId, item.AnonId, item.SessionId))
            .Where(group => !string.IsNullOrWhiteSpace(group.Key))
            .Select(group => group.OrderByDescending(item => item.Timestamp).First())
            .ToList();

        var counts = new Dictionary<string, int>(StringComparer.Ordinal)
        {
            ["👍"] = 0,
            ["❤️"] = 0,
            ["🔥"] = 0,
            ["🎮"] = 0,
            ["👀"] = 0
        };

        foreach (var item in latestByActor)
        {
            if (string.Equals(item.EventType, "POST_REACTION_REMOVE", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var reaction = GetReactionFromMeta(item);
            if (!string.IsNullOrWhiteSpace(reaction) && counts.ContainsKey(reaction))
            {
                counts[reaction] += 1;
            }
        }

        var myKey = BuildActorKey(userId, anonId, string.Empty);
        var myReaction = latestByActor
            .Where(item => string.Equals(BuildActorKey(item.UserId, item.AnonId, item.SessionId), myKey, StringComparison.Ordinal))
            .Select(item => string.Equals(item.EventType, "POST_REACTION_REMOVE", StringComparison.OrdinalIgnoreCase) ? string.Empty : GetReactionFromMeta(item))
            .FirstOrDefault() ?? string.Empty;

        return new BlogEngagementSummary
        {
            ViewsCount = views,
            CompletedReadsCount = reads,
            ReactionCounts = counts,
            TotalReactions = counts.Values.Sum(),
            MyReaction = myReaction
        };
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

public class BlogReactionRequest
{
    public static readonly HashSet<string> AllowedReactions = new(StringComparer.Ordinal)
    {
        "👍",
        "❤️",
        "🔥",
        "🎮",
        "👀"
    };

    public string PostId { get; set; }
    public string Reaction { get; set; }
    public string AnonId { get; set; }
    public string SessionId { get; set; }
}

public class BlogEngagementSummary
{
    public int ViewsCount { get; set; }
    public int CompletedReadsCount { get; set; }
    public Dictionary<string, int> ReactionCounts { get; set; } = new();
    public int TotalReactions { get; set; }
    public string MyReaction { get; set; } = string.Empty;
}

public class BlogEventRequest
{
    public static readonly HashSet<string> AllowedEventTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "POST_IMPRESSION",
        "POST_OPEN",
        "POST_READ_PROGRESS",
        "POST_READ_COMPLETE",
        "POST_LIKE",
        "POST_BOOKMARK",
        "POST_REACTION_SET",
        "POST_REACTION_REMOVE"
    };

    public string PostId { get; set; }
    public string EventType { get; set; }
    [JsonPropertyName("ts")]
    public DateTime? Timestamp { get; set; }
    public string AnonId { get; set; }
    public string SessionId { get; set; }
    public int? DwellMs { get; set; }
    public double? ScrollDepth { get; set; }
    public string Referrer { get; set; }
    public Dictionary<string, string> Meta { get; set; }
}
