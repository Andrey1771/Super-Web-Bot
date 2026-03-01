using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using System.Security.Claims;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/admin/blog/home-settings")]
[Authorize(Roles = "admin")]
public class AdminBlogHomepageSettingsController : ControllerBase
{
    private readonly IBlogHomepageSettingsRepository _settingsRepository;
    private readonly IBlogRepository _blogRepository;

    public AdminBlogHomepageSettingsController(IBlogHomepageSettingsRepository settingsRepository, IBlogRepository blogRepository)
    {
        _settingsRepository = settingsRepository;
        _blogRepository = blogRepository;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var settings = await _settingsRepository.GetAsync();
        return Ok(new
        {
            mainHeroPostId = settings?.MainHeroPostId,
            updatedAt = settings?.UpdatedAt,
            updatedBy = settings?.UpdatedBy
        });
    }

    [HttpPut("main-hero")]
    public async Task<IActionResult> SetMainHero([FromBody] UpdateMainHeroRequest request)
    {
        if (request == null)
        {
            return BadRequest("Request body is required.");
        }

        if (!string.IsNullOrWhiteSpace(request.MainHeroPostId))
        {
            var post = await _blogRepository.GetByIdAsync(request.MainHeroPostId);
            if (post == null)
            {
                return NotFound("Post not found.");
            }

            if (!string.Equals(post.Status, "PUBLISHED", StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest("Only published posts can be selected as main hero.");
            }
        }

        var settings = new BlogHomepageSettings
        {
            Id = "default",
            MainHeroPostId = request.MainHeroPostId,
            UpdatedAt = DateTime.UtcNow,
            UpdatedBy = GetCurrentUserId()
        };

        var saved = await _settingsRepository.UpsertAsync(settings);
        return Ok(new
        {
            mainHeroPostId = saved.MainHeroPostId,
            updatedAt = saved.UpdatedAt,
            updatedBy = saved.UpdatedBy
        });
    }

    private string GetCurrentUserId()
    {
        return User?.FindFirst("email")?.Value
               ?? User?.FindFirst(ClaimTypes.Email)?.Value
               ?? User?.FindFirst("preferred_username")?.Value
               ?? User?.FindFirst(ClaimTypes.NameIdentifier)?.Value
               ?? User?.FindFirst("sub")?.Value
               ?? "admin";
    }
}

public class UpdateMainHeroRequest
{
    public string MainHeroPostId { get; set; }
}
