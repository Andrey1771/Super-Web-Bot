using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using System.Security.Claims;
using System.Text.Json.Serialization;

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

        var blogEvent = new BlogEvent
        {
            PostId = request.PostId,
            EventType = request.EventType,
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

public class BlogEventRequest
{
    public static readonly HashSet<string> AllowedEventTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "POST_IMPRESSION",
        "POST_OPEN",
        "POST_READ_PROGRESS",
        "POST_READ_COMPLETE",
        "POST_LIKE",
        "POST_BOOKMARK"
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
