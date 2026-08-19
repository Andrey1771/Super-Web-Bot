using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.WebApi.Services;

namespace SuperBot.WebApi.Controllers;

/// <summary>Сводка для главной страницы админки: заказы, ключи, поддержка, платежи, здоровье.</summary>
[ApiController]
[Route("api/admin/dashboard")]
[Authorize(Roles = "admin")]
public class AdminDashboardController : ControllerBase
{
    private readonly AdminDashboardService _dashboard;

    public AdminDashboardController(AdminDashboardService dashboard) => _dashboard = dashboard;

    [HttpGet]
    public async Task<ActionResult<AdminDashboardDto>> Get(CancellationToken ct) =>
        Ok(await _dashboard.BuildAsync(ct));
}
