using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;

namespace SuperBot.BotApi.Controllers
{
    /// <summary>
    /// Тексты и клавиши бота (админка /admin/botChanger). Живут в бот-сервисе, т.к. это его данные.
    /// Раньше были в site AdminController (/api/Admin) — переехали при выделении бота.
    /// </summary>
    [ApiController]
    [Route("api/admin/bot/texts")]
    [Authorize(Roles = "admin")]
    public class BotResourcesController(IResourceService _resourceService) : ControllerBase
    {
        [HttpGet]
        public ActionResult<Resources> GetResources() => Ok(_resourceService.Resources);

        [HttpPut]
        public async Task<ActionResult<Resources>> UpdateResources([FromBody] Resources newResources)
        {
            if (newResources == null)
            {
                return BadRequest("Invalid resource data provided.");
            }

            await _resourceService.UpdateResourcesAsync(newResources);
            return Ok(_resourceService.Resources);
        }
    }
}
