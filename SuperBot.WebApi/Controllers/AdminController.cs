using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Interfaces;
using SuperBot.WebApi.Services;

namespace SuperBot.WebApi.Controllers
{
    // Тексты бота (GET/POST /api/Admin) переехали в бот-сервис (BotResourcesController).
    // Здесь остались только Keycloak login-events, к Telegram отношения не имеющие.
    [ApiController]
    [Route("api/[controller]")]
    public class AdminController(KeycloakAdminClient keycloak, ILogger<AdminController> logger) : Controller
    {
        /// <summary>
        /// Журнал входов для экрана «Login history».
        ///
        /// Раньше сюда пересылался токен того, кто открыл страницу, и Keycloak отвечал 403:
        /// у администратора магазина есть наша роль admin, но ролей realm-management у него
        /// нет и не должно быть — это разные системы прав. Страница показывала 502 всегда,
        /// а не при сбое. Теперь читаем журнал служебным аккаунтом, а право смотреть его
        /// решает атрибут ниже.
        /// </summary>
        [HttpGet]
        [Route("data")]
        [Authorize(Roles = "admin")]
        public async Task<ActionResult<IEnumerable<LoginEventRepresentation>>> GetAllMappedLoginEvents(
            [FromQuery] string? type = null,
            [FromQuery] int skip = 0,
            [FromQuery] int take = 100,
            [FromQuery] string? user = null,
            [FromQuery] string? client = null,
            [FromQuery] string? dateFrom = null,
            [FromQuery] string? dateTo = null)
        {
            try
            {
                // Пустой тип означает «все события», а не «только входы»: страница даёт
                // выбрать тип, и подменять его умолчанием здесь было бы неверно.
                return Ok(await keycloak.GetLoginEventsAsync(
                    type,
                    Math.Max(0, skip),
                    Math.Clamp(take, 1, 500),
                    user,
                    client,
                    dateFrom,
                    dateTo));
            }
            catch (Exception ex)
            {
                // Keycloak недоступен или отказал — понятный статус вместо 500, и след в логе:
                // без него причина отказа не видна никому.
                logger.LogError(ex, "Login history: Keycloak events request failed.");
                return StatusCode(StatusCodes.Status502BadGateway, $"Keycloak admin API request failed: {ex.Message}");
            }
        }
    }
}
