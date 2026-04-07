using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using System.Security.Claims;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/admin/blog/view-settings")]
[Authorize(Roles = "admin")]
public class AdminBlogViewSettingsController : ControllerBase
{
    private readonly IBlogViewSettingsRepository _settingsRepository;
    private readonly IBlogPostUniqueViewRepository _uniqueViewRepository;

    public AdminBlogViewSettingsController(IBlogViewSettingsRepository settingsRepository, IBlogPostUniqueViewRepository uniqueViewRepository)
    {
        _settingsRepository = settingsRepository;
        _uniqueViewRepository = uniqueViewRepository;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var settings = await _settingsRepository.GetAsync() ?? new BlogViewSettings();
        var counters = await _uniqueViewRepository.GetGlobalCountersAsync();

        return Ok(new
        {
            countGuestViewsInPublicCounts = settings.CountGuestViewsInPublicCounts,
            publicUniqueViews = counters.PublicUniqueViews,
            authenticatedUniqueViews = counters.AuthenticatedUniqueViews,
            guestUniqueViewsTotal = counters.GuestUniqueViewsTotal,
            guestUniqueViewsCounted = counters.GuestUniqueViewsCounted,
            guestUniqueViewsExcluded = counters.GuestUniqueViewsExcluded
        });
    }

    [HttpPut]
    public async Task<IActionResult> Update([FromBody] UpdateBlogViewSettingsRequest request)
    {
        var settings = await _settingsRepository.GetAsync() ?? new BlogViewSettings();
        settings.CountGuestViewsInPublicCounts = request?.CountGuestViewsInPublicCounts ?? true;
        settings.UpdatedAt = DateTime.UtcNow;
        settings.UpdatedBy = GetCurrentUserId();
        var saved = await _settingsRepository.UpsertAsync(settings);
        return Ok(new { countGuestViewsInPublicCounts = saved.CountGuestViewsInPublicCounts });
    }

    [HttpPost("exclude-guest-views")]
    public async Task<IActionResult> ExcludeGuestViews()
    {
        var modified = await _uniqueViewRepository.ExcludeGuestViewsAsync();
        return Ok(new { modified });
    }

    [HttpDelete("guest-views")]
    public async Task<IActionResult> DeleteGuestViews()
    {
        var deleted = await _uniqueViewRepository.DeleteGuestViewsAsync();
        return Ok(new { deleted });
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

public class UpdateBlogViewSettingsRequest
{
    public bool CountGuestViewsInPublicCounts { get; set; } = true;
}
