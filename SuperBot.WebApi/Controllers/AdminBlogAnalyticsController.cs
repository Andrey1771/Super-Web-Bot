using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/admin/blog/analytics")]
[Authorize(Roles = "admin")]
public class AdminBlogAnalyticsController : ControllerBase
{
    private readonly IBlogRepository _blogRepository;
    private readonly IBlogPostUniqueViewRepository _uniqueViewRepository;
    private readonly IBlogRecommendationsService _blogRecommendationsService;

    public AdminBlogAnalyticsController(
        IBlogRepository blogRepository,
        IBlogPostUniqueViewRepository uniqueViewRepository,
        IBlogRecommendationsService blogRecommendationsService)
    {
        _blogRepository = blogRepository;
        _uniqueViewRepository = uniqueViewRepository;
        _blogRecommendationsService = blogRecommendationsService;
    }

    [HttpGet("overview")]
    public async Task<IActionResult> GetOverview()
    {
        var posts = await _blogRepository.GetAllAsync();
        var ids = posts.Select(item => item.Id).Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (ids.Count == 0)
        {
            return Ok(new { });
        }

        var countersByPost = await _uniqueViewRepository.GetCountersByPostIdsAsync(ids);
        var viewTimelineBuckets = new Dictionary<DateTime, int>();
        var latestViewEvents = new List<OverviewLatestEventItem>();
        foreach (var postId in ids)
        {
            var timeline = await _uniqueViewRepository.GetPublicViewTimelineByPostIdAsync(postId);
            foreach (var point in timeline)
            {
                if (!viewTimelineBuckets.ContainsKey(point.BucketStart))
                {
                    viewTimelineBuckets[point.BucketStart] = 0;
                }
                viewTimelineBuckets[point.BucketStart] += point.Count;
            }

            var latestViews = await _uniqueViewRepository.GetLatestViewsByPostIdAsync(postId, 8);
            latestViewEvents.AddRange(latestViews.Select(item => new OverviewLatestEventItem
            {
                timestamp = item.LastViewedAt,
                actorType = string.IsNullOrWhiteSpace(item.UserId) ? "guest" : "authenticated",
                actorDisplay = BuildActorDisplay(item.UserId, item.AnonId, item.LastSessionId),
                eventType = "view",
                reaction = string.Empty
            }));
        }

        var allEvents = new List<BlogEvent>();
        foreach (var postId in ids)
        {
            var events = await _blogRecommendationsService.GetEventsByPostAsync(postId, DateTime.UtcNow.AddYears(-5));
            allEvents.AddRange(events);
        }

        var reactionsByPost = posts.ToDictionary(
            post => post.Id,
            post => CountReactions(allEvents.Where(item => item.PostId == post.Id).ToList()).Values.Sum(),
            StringComparer.OrdinalIgnoreCase);

        var reads = allEvents
            .Where(item => string.Equals(item.EventType, "POST_READ_COMPLETE", StringComparison.OrdinalIgnoreCase))
            .GroupBy(item => $"{item.PostId}:{BuildActorKey(item)}")
            .Count(group => !string.IsNullOrWhiteSpace(group.Key));

        var reactionsByEmoji = CountReactions(allEvents);
        var topReaction = reactionsByEmoji.OrderByDescending(item => item.Value).ThenBy(item => item.Key).FirstOrDefault();

        var reactionTimeline = allEvents
            .Where(item => string.Equals(item.EventType, "POST_REACTION_SET", StringComparison.OrdinalIgnoreCase))
            .GroupBy(item => new DateTime(item.Timestamp.Year, item.Timestamp.Month, item.Timestamp.Day, item.Timestamp.Hour, 0, 0, DateTimeKind.Utc))
            .OrderBy(group => group.Key)
            .Select(group => new
            {
                bucketStart = group.Key,
                count = group.Count(),
                reactionsByEmoji = new Dictionary<string, int>
                {
                    ["👍"] = group.Count(item => GetReaction(item) == "👍"),
                    ["❤️"] = group.Count(item => GetReaction(item) == "❤️"),
                    ["🔥"] = group.Count(item => GetReaction(item) == "🔥"),
                    ["🎮"] = group.Count(item => GetReaction(item) == "🎮"),
                    ["👀"] = group.Count(item => GetReaction(item) == "👀")
                }
            })
            .ToList();

        var latestEvents = allEvents
            .OrderByDescending(item => item.Timestamp)
            .Take(80)
            .Select(item => new OverviewLatestEventItem
            {
                timestamp = item.Timestamp,
                actorType = string.IsNullOrWhiteSpace(item.UserId) ? "guest" : "authenticated",
                actorDisplay = BuildActorDisplay(item.UserId, item.AnonId, item.SessionId),
                eventType = NormalizeEventType(item.EventType),
                reaction = GetReaction(item)
            })
            .Concat(latestViewEvents)
            .OrderByDescending(item => item.timestamp)
            .Take(80)
            .Cast<object>()
            .ToList();

        var totalPublic = countersByPost.Values.Sum(item => item.PublicUniqueViews);
        var totalAuth = countersByPost.Values.Sum(item => item.AuthenticatedUniqueViews);
        var totalGuestTotal = countersByPost.Values.Sum(item => item.GuestUniqueViewsTotal);
        var totalGuestCounted = countersByPost.Values.Sum(item => item.GuestUniqueViewsCounted);
        var totalGuestExcluded = countersByPost.Values.Sum(item => item.GuestUniqueViewsExcluded);

        return Ok(new
        {
            publicUniqueViews = totalPublic,
            authenticatedUniqueViews = totalAuth,
            guestUniqueViewsTotal = totalGuestTotal,
            guestUniqueViewsCounted = totalGuestCounted,
            guestUniqueViewsExcluded = totalGuestExcluded,
            completedReads = reads,
            totalReactions = reactionsByEmoji.Values.Sum(),
            topReaction = topReaction.Value > 0 ? topReaction.Key : string.Empty,
            reactionsByEmoji,
            topPostsByViews = posts
                .Select(post => new
                {
                    postId = post.Id,
                    title = post.Title,
                    slug = post.Slug,
                    views = countersByPost.TryGetValue(post.Id, out var counters) ? counters.PublicUniqueViews : 0
                })
                .OrderByDescending(item => item.views)
                .Take(10)
                .ToList(),
            topPostsByReactions = posts
                .Select(post => new
                {
                    postId = post.Id,
                    title = post.Title,
                    slug = post.Slug,
                    reactions = reactionsByPost.TryGetValue(post.Id, out var value) ? value : 0
                })
                .OrderByDescending(item => item.reactions)
                .Take(10)
                .ToList(),
            viewsTimeline = viewTimelineBuckets
                .OrderBy(item => item.Key)
                .Select(item => new { bucketStart = item.Key, count = item.Value })
                .ToList(),
            reactionsTimeline = reactionTimeline,
            latestEvents
        });
    }

    [HttpGet("breakdown")]
    public async Task<IActionResult> GetBreakdown([FromQuery] string metric, [FromQuery] string bucket = "", [FromQuery] string emoji = "")
    {
        var posts = await _blogRepository.GetAllAsync();
        var ids = posts.Select(item => item.Id).Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (ids.Count == 0)
        {
            return Ok(new { title = "Analytics breakdown", items = Array.Empty<object>() });
        }

        var countersByPost = await _uniqueViewRepository.GetCountersByPostIdsAsync(ids);
        var parsedBucket = DateTime.TryParse(bucket, out var bucketDt)
            ? new DateTime(bucketDt.ToUniversalTime().Year, bucketDt.ToUniversalTime().Month, bucketDt.ToUniversalTime().Day, bucketDt.ToUniversalTime().Hour, 0, 0, DateTimeKind.Utc)
            : (DateTime?)null;

        var rows = new List<BreakdownRow>();
        foreach (var post in posts)
        {
            countersByPost.TryGetValue(post.Id, out var counters);
            counters ??= new BlogUniqueViewCounters();

            var events = await _blogRecommendationsService.GetEventsByPostAsync(post.Id, DateTime.UtcNow.AddYears(-5));
            var reactions = CountReactions(events);
            var totalReactions = reactions.Values.Sum();
            var value = metric switch
            {
                "public_views" => counters.PublicUniqueViews,
                "auth_views" => counters.AuthenticatedUniqueViews,
                "guest_views" => counters.GuestUniqueViewsTotal,
                "reactions" => totalReactions,
                "emoji" => reactions.TryGetValue(emoji, out var emojiCount) ? emojiCount : 0,
                "views_bucket" => await CountViewsForBucketAsync(post.Id, parsedBucket),
                "reactions_bucket" => CountReactionsForBucket(events, parsedBucket, emoji),
                _ => 0
            };

            rows.Add(new BreakdownRow
            {
                postId = post.Id,
                title = post.Title,
                slug = post.Slug,
                value = value,
                publicViews = counters.PublicUniqueViews,
                authViews = counters.AuthenticatedUniqueViews,
                guestViews = counters.GuestUniqueViewsTotal,
                totalReactions = totalReactions,
                reactionsByEmoji = reactions
            });
        }

        return Ok(new
        {
            title = BuildBreakdownTitle(metric, emoji, parsedBucket),
            metric,
            bucket = parsedBucket,
            emoji,
            items = rows
                .OrderByDescending(item => item.value)
                .Take(20)
                .Cast<object>()
                .ToList()
        });
    }

    private async Task<int> CountViewsForBucketAsync(string postId, DateTime? bucket)
    {
        if (!bucket.HasValue)
        {
            return 0;
        }

        var timeline = await _uniqueViewRepository.GetPublicViewTimelineByPostIdAsync(postId);
        return timeline.Where(item => item.BucketStart == bucket.Value).Sum(item => item.Count);
    }

    private static int CountReactionsForBucket(IReadOnlyList<BlogEvent> events, DateTime? bucket, string emoji)
    {
        if (!bucket.HasValue)
        {
            return 0;
        }

        var normalizedEmoji = NormalizeReaction(emoji);
        var filtered = events.Where(item =>
            string.Equals(item.EventType, "POST_REACTION_SET", StringComparison.OrdinalIgnoreCase) &&
            new DateTime(item.Timestamp.Year, item.Timestamp.Month, item.Timestamp.Day, item.Timestamp.Hour, 0, 0, DateTimeKind.Utc) == bucket.Value);

        if (!string.IsNullOrWhiteSpace(normalizedEmoji))
        {
            filtered = filtered.Where(item => GetReaction(item) == normalizedEmoji);
        }

        return filtered.Count();
    }

    private static string BuildBreakdownTitle(string metric, string emoji, DateTime? bucket)
    {
        return metric switch
        {
            "public_views" => "Posts contributing to all-post public views",
            "auth_views" => "Posts contributing to all-post auth views",
            "guest_views" => "Posts contributing to all-post guest views",
            "reactions" => "Posts contributing to all-post reactions",
            "emoji" => $"Posts contributing to {emoji} reactions",
            "views_bucket" => $"Posts contributing to views bucket {bucket:yyyy-MM-dd HH:mm}",
            "reactions_bucket" => $"Posts contributing to reactions bucket {bucket:yyyy-MM-dd HH:mm}",
            _ => "Analytics breakdown"
        };
    }

    private static string BuildActorKey(BlogEvent item)
    {
        if (!string.IsNullOrWhiteSpace(item.UserId))
        {
            return $"u:{item.UserId}";
        }
        if (!string.IsNullOrWhiteSpace(item.AnonId))
        {
            return $"a:{item.AnonId}";
        }
        if (!string.IsNullOrWhiteSpace(item.SessionId))
        {
            return $"s:{item.SessionId}";
        }
        return string.Empty;
    }

    private static string BuildActorDisplay(string userId, string anonId, string sessionId)
    {
        if (!string.IsNullOrWhiteSpace(userId))
        {
            return userId;
        }
        if (!string.IsNullOrWhiteSpace(anonId))
        {
            var suffix = anonId.Length <= 8 ? anonId : anonId[..8];
            return $"Guest a:{suffix}";
        }
        if (!string.IsNullOrWhiteSpace(sessionId))
        {
            var suffix = sessionId.Length <= 6 ? sessionId : sessionId[..6];
            return $"Guest #{suffix}";
        }
        return "Guest";
    }

    private static string NormalizeEventType(string eventType)
    {
        if (string.Equals(eventType, "POST_OPEN", StringComparison.OrdinalIgnoreCase))
        {
            return "view";
        }
        if (string.Equals(eventType, "POST_READ_COMPLETE", StringComparison.OrdinalIgnoreCase))
        {
            return "completed_read";
        }
        if (string.Equals(eventType, "POST_REACTION_SET", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(eventType, "POST_REACTION_REMOVE", StringComparison.OrdinalIgnoreCase))
        {
            return "reaction";
        }
        return eventType ?? string.Empty;
    }

    private static string GetReaction(BlogEvent item)
    {
        if (item.Meta == null)
        {
            return string.Empty;
        }
        return item.Meta.TryGetValue("reaction", out var reaction) ? NormalizeReaction(reaction) : string.Empty;
    }

    private static string NormalizeReaction(string reaction)
    {
        if (string.IsNullOrWhiteSpace(reaction))
        {
            return string.Empty;
        }

        return reaction.Trim().Replace("\uFE0E", string.Empty).Replace("\uFE0F", string.Empty);
    }

    private static Dictionary<string, int> CountReactions(IReadOnlyList<BlogEvent> events)
    {
        var counts = new Dictionary<string, int>
        {
            ["👍"] = 0,
            ["❤️"] = 0,
            ["🔥"] = 0,
            ["🎮"] = 0,
            ["👀"] = 0
        };

        var latestByActor = events
            .Where(item => string.Equals(item.EventType, "POST_REACTION_SET", StringComparison.OrdinalIgnoreCase) ||
                           string.Equals(item.EventType, "POST_REACTION_REMOVE", StringComparison.OrdinalIgnoreCase))
            .GroupBy(item => new
            {
                postId = item.PostId,
                actorKey = BuildActorKey(item)
            })
            .Where(group => !string.IsNullOrWhiteSpace(group.Key.postId) && !string.IsNullOrWhiteSpace(group.Key.actorKey))
            .Select(group => group.OrderByDescending(item => item.Timestamp).First())
            .ToList();

        foreach (var item in latestByActor)
        {
            if (string.Equals(item.EventType, "POST_REACTION_REMOVE", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }
            var reaction = GetReaction(item);
            if (!string.IsNullOrWhiteSpace(reaction) && counts.ContainsKey(reaction))
            {
                counts[reaction] += 1;
            }
        }

        return counts;
    }

    private sealed class OverviewLatestEventItem
    {
        public DateTime timestamp { get; set; }
        public string actorType { get; set; } = "guest";
        public string actorDisplay { get; set; } = string.Empty;
        public string eventType { get; set; } = string.Empty;
        public string reaction { get; set; } = string.Empty;
    }

    private sealed class BreakdownRow
    {
        public string postId { get; set; } = string.Empty;
        public string title { get; set; } = string.Empty;
        public string slug { get; set; } = string.Empty;
        public int value { get; set; }
        public int publicViews { get; set; }
        public int authViews { get; set; }
        public int guestViews { get; set; }
        public int totalReactions { get; set; }
        public Dictionary<string, int> reactionsByEmoji { get; set; } = new();
    }
}
