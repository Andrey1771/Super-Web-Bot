using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;


namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AdminController(IResourceService _resourceService) : Controller
    {
        [HttpGet]
        public ActionResult<IEnumerable<Resources>> GetResources()
        {
            return Ok(_resourceService.Resources);
        }

        [HttpPost]
        public async Task<ActionResult<IEnumerable<Resources>>> UpdateResources([FromBody] Resources newResources)
        {
            if (newResources == null)
            {
                return BadRequest("Invalid resource data provided.");
            }

            // Обновляем ресурсы через метод сервиса
            await _resourceService.UpdateResourcesAsync(newResources);

            return Ok(_resourceService.Resources);
        }
    }
}
