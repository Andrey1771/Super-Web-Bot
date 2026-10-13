using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.WebApi.Services.Health;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Разбор состояния сервисов для страницы /admin/health.
///
/// Читает снимки, которые оставил фоновый монитор, а не опрашивает всё заново: открытие
/// страницы не должно само создавать нагрузку на чужие API, и только снимки знают, с какого
/// момента держится состояние. Перепроверить сейчас — отдельная кнопка, отдельный метод.
/// </summary>
[ApiController]
[Route("api/admin/health")]
[Authorize(Roles = "admin")]
public class AdminHealthController : ControllerBase
{
    private readonly ServiceHealthMonitor _monitor;

    public AdminHealthController(ServiceHealthMonitor monitor) => _monitor = monitor;

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ServiceHealthSnapshotDto>>> Get(CancellationToken ct) =>
        Ok(await _monitor.GetSnapshotsAsync(ct));

    /// <summary>
    /// Прогнать проверки прямо сейчас. Это тот же прогон, что и по расписанию, — со всеми
    /// последствиями: снимки обновятся, а изменившееся состояние уедет письмом.
    /// </summary>
    [HttpPost("run")]
    public async Task<ActionResult<IReadOnlyList<ServiceHealthSnapshotDto>>> Run(CancellationToken ct)
    {
        await _monitor.RunAsync(ct);
        return Ok(await _monitor.GetSnapshotsAsync(ct));
    }
}
