using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Interfaces;
using SuperBot.WebApi.Services;
using SuperBot.WebApi.Services.Storefront;
using System.Security.Claims;
using SuperBot.Common.Auth;

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

    // Второй адрес — «/api/blog/home-feed»: слово «recommendations» в URL режут
    // популярные фильтры блокировщиков рекламы (правила про recommendation-виджеты),
    // и у посетителей с блокировщиком лента вставала на фолбэк. Старый адрес
    // оставлен для совместимости.
    [HttpGet("home")]
    [HttpGet("/api/blog/home-feed")]
    public async Task<IActionResult> GetHomeRecommendations([FromQuery] string anonId = "", [FromQuery] int limit = 6)
    {
        var userId = User.GetUserKey();
        var result = await _recommendationsService.GetHomeRecommendationsAsync(userId, anonId, limit);
        var language = BuyerLanguage.Resolve(Request);

        return Ok(new BlogRecommendationsResponse
        {
            HeroPost = BlogPostSummary.From(result.HeroPost, language),
            LatestPosts = result.LatestPosts.Select(post => BlogPostSummary.From(post, language)).ToList(),
            PopularThisWeek = result.PopularThisWeek.Select(post => BlogPostSummary.From(post, language)).ToList(),
            EditorsPicks = result.EditorsPicks.Select(post => BlogPostSummary.From(post, language)).ToList(),
            ForYou = result.ForYou.Select(post => BlogPostSummary.From(post, language)).ToList()
        });
    }

    [Authorize]
    [HttpGet("history")]
    public async Task<IActionResult> GetHistory([FromQuery] int limit = 50)
    {
        var userId = User.GetUserKey();
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Unauthorized();
        }

        var history = await _recommendationsService.GetReadingHistoryAsync(userId, limit);
        var language = BuyerLanguage.Resolve(Request);
        return Ok(history.Select(post => BlogPostSummary.From(post, language)).ToList());
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
    /// <summary>Подписи тегов на языке покупателя по позициям; сами теги — значения фильтра.</summary>
    public List<string> TagLabels { get; set; }
    public DateTime? PublishedAt { get; set; }
    public int? ReadingTime { get; set; }

    public static BlogPostSummary From(SuperBot.Core.Entities.BlogPost post, string? language = null)
    {
        if (post == null)
        {
            return null;
        }

        return new BlogPostSummary
        {
            Id = post.Id,
            Slug = post.Slug,
            Title = BlogLocalizer.Title(post, language),
            Excerpt = BlogLocalizer.Excerpt(post, language),
            CoverUrl = post.CoverUrl,
            Tags = post.Tags ?? Array.Empty<string>(),
            TagLabels = BlogLocalizer.TagLabels(post, language),
            PublishedAt = post.PublishedAt,
            ReadingTime = post.ReadingTime
        };
    }
}
