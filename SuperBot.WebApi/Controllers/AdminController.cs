using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;

namespace SuperBot.WebApi.Controllers
{
    // Тексты бота (GET/POST /api/Admin) переехали в бот-сервис (BotResourcesController).
    // Здесь остались только Keycloak login-events, к Telegram отношения не имеющие.
    [ApiController]
    [Route("api/[controller]")]
    public class AdminController(IKeycloakClient _keycloakClient) : Controller
    {
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

            try
            {
                var allLoginEvents = await _keycloakClient.GetAllLoginEventsAsync("TaleShop", accessToken); // TODO Вынести TaleShop
                return Ok(allLoginEvents);
            }
            catch (HttpRequestException ex)
            {
                // Keycloak недоступен или отказал в доступе — отдаём понятный статус вместо 500.
                return StatusCode(StatusCodes.Status502BadGateway, $"Keycloak admin API request failed: {ex.Message}");
            }
        }
    }
}
