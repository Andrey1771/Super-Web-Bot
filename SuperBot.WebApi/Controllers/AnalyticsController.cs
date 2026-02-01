using Microsoft.AspNetCore.Mvc;

namespace SuperBot.WebApi.Controllers
{
    [Route("api/analytics")]
    [ApiController]
    public class AnalyticsController : ControllerBase
    {
        [HttpGet("settings")]
        public IActionResult GetSettings()
        {
            return Ok(new
            {
                enabled = false,
                sampleRate = 0,
                provider = "mock"
            });
        }
    }
}
