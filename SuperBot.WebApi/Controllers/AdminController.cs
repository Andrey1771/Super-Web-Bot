using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.WebApi.Services;


namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AdminController(IResourceService _resourceService, IKeycloakClient _keycloakClient) : Controller
    {
        [HttpGet]
        [Authorize(Roles = "admin")]
        public ActionResult<IEnumerable<Resources>> GetResources()
        {
            return Ok(_resourceService.Resources);
        }

        [HttpGet]
        [Route("data")]
        [Authorize(Roles = "admin")]
        public async Task<ActionResult<IEnumerable<LoginEventRepresentation>>> GetAllMappedLoginEvents()
        {
            // Получаем access-токен из заголовка Authorization
            var accessToken = HttpContext.Request.Headers["Authorization"].ToString().Replace("Bearer ", "");
            if (string.IsNullOrEmpty(accessToken))
            {
                return Unauthorized("Access token is missing");
            }

            var allLoginEvents = await _keycloakClient.GetAllLoginEventsAsync("TaleShop", accessToken); // TODO Вынести TaleShop
            return Ok(allLoginEvents);
        }

        [HttpPost]
        [Authorize(Roles = "admin")]
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
