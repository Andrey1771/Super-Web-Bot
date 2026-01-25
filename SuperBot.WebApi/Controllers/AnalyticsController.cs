using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/analytics")]
public class AnalyticsController : ControllerBase
{
    private readonly IAnalyticsSettingsRepository _settingsRepository;

    public AnalyticsController(IAnalyticsSettingsRepository settingsRepository)
    {
        _settingsRepository = settingsRepository;
    }

    [HttpGet("settings")]
    public async Task<IActionResult> GetSettings()
    {
        var settings = await _settingsRepository.GetAsync();
        if (settings == null)
        {
            return Ok(new
            {
                isEnabled = false,
                gaMeasurementId = string.Empty,
                gtmContainerId = string.Empty,
                yandexCounterId = string.Empty
            });
        }

        return Ok(new
        {
            isEnabled = settings.IsEnabled,
            gaMeasurementId = settings.GaMeasurementId ?? string.Empty,
            gtmContainerId = settings.GtmContainerId ?? string.Empty,
            yandexCounterId = settings.YandexCounterId ?? string.Empty
        });
    }
}
