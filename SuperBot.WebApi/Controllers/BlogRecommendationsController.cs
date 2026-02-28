using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Interfaces;
using System.Security.Claims;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/blog/recommendations")]
public class BlogRecommendationsController : ControllerBase
{
    private readonly IBlogRecommendationsService _recommendationsService;

    public BlogRecommendationsController(IBlogRecommendationsService recommendationsService)
    {
        _recommendationsService = recommendationsService;
    }

    [HttpGet("home")]
    public async Task<IActionResult> GetHomeRecommendations([FromQuery] string anonId = "", [FromQuery] int limit = 6)
    {
        var userId = GetCurrentUserId();
        var result = await _recommendationsService.GetHomeRecommendationsAsync(userId, anonId, limit);

        return Ok(new BlogRecommendationsResponse
        {
            HeroPost = BlogPostSummary.From(result.HeroPost),
            LatestPosts = result.LatestPosts.Select(BlogPostSummary.From).ToList(),
            PopularThisWeek = result.PopularThisWeek.Select(BlogPostSummary.From).ToList(),
            EditorsPicks = result.EditorsPicks.Select(BlogPostSummary.From).ToList(),
            ForYou = result.ForYou.Select(BlogPostSummary.From).ToList()
        });
    }

    [Authorize]
    [HttpGet("history")]
    public async Task<IActionResult> GetHistory([FromQuery] int limit = 50)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Unauthorized();
        }

        var history = await _recommendationsService.GetReadingHistoryAsync(userId, limit);
        return Ok(history.Select(BlogPostSummary.From).ToList());
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

public class BlogRecommendationsResponse
{
    public BlogPostSummary HeroPost { get; set; }
    public List<BlogPostSummary> LatestPosts { get; set; } = new();
    public List<BlogPostSummary> PopularThisWeek { get; set; } = new();
    public List<BlogPostSummary> EditorsPicks { get; set; } = new();
    public List<BlogPostSummary> ForYou { get; set; } = new();
}

public class BlogPostSummary
{
    public string Id { get; set; }
    public string Slug { get; set; }
    public string Title { get; set; }
    public string Excerpt { get; set; }
    public string CoverUrl { get; set; }
    public string[] Tags { get; set; }
    public DateTime? PublishedAt { get; set; }
    public int? ReadingTime { get; set; }
    public bool Featured { get; set; }
    public bool IsMainEditorsPick { get; set; }

    public static BlogPostSummary From(SuperBot.Core.Entities.BlogPost post)
    {
        if (post == null)
        {
            return null;
        }

        return new BlogPostSummary
        {
            Id = post.Id,
            Slug = post.Slug,
            Title = post.Title,
            Excerpt = post.Excerpt,
            CoverUrl = post.CoverUrl,
            Tags = post.Tags ?? Array.Empty<string>(),
            PublishedAt = post.PublishedAt,
            ReadingTime = post.ReadingTime,
            Featured = post.Featured,
            IsMainEditorsPick = post.IsMainEditorsPick
        };
    }
}
