using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/blog/posts")]
public class BlogController : ControllerBase
{
    private readonly IBlogRepository _blogRepository;

    public BlogController(IBlogRepository blogRepository)
    {
        _blogRepository = blogRepository;
    }

    [HttpGet]
    public async Task<IActionResult> GetPosts(
        [FromQuery] string status = "PUBLISHED",
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 12,
        [FromQuery] string tag = "",
        [FromQuery] string search = "",
        [FromQuery] bool? featured = null,
        [FromQuery] bool? mainFeatured = null)
    {
        var query = new BlogQueryParameters
        {
            Page = page,
            PageSize = pageSize,
            Tag = tag,
            Search = search,
            Status = status,
            Featured = featured,
            MainFeatured = mainFeatured
        };

        var (items, total) = await _blogRepository.GetPublicPagedAsync(query);
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
            post.MainFeatured
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
        return Ok(new { post, version });
    }
}
