using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using SuperBot.BotApi.Services;
using SuperBot.BotApi.Types;
using Telegram.Bot;
using Telegram.Bot.Types;

namespace SuperBot.BotApi.Controllers
{
    /// <summary>
    /// Приём Telegram-вебхука. Регистрация вебхука — через /api/admin/bot (админка).
    /// </summary>
    [Route("api/[controller]")]
    [ApiController]
    public class TelegramController(IOptions<BotConfiguration> Config) : ControllerBase
    {
        [HttpPost]
        public async Task<IActionResult> Post([FromServices] TelegramUpdateHandler handleUpdateService, CancellationToken ct)
        {
            // Секрет из настройки вебхука: чужие POST-ы отбрасываем.
            var secretToken = Config.Value.SecretToken;
            if (!string.IsNullOrEmpty(secretToken) &&
                Request.Headers["X-Telegram-Bot-Api-Secret-Token"] != secretToken)
            {
                return Forbid();
            }

            // Тело — в формате Telegram (snake_case): разбираем его настройками самой библиотеки, а не
            // общими настройками сервиса, которые остаются camelCase для ответов сайту.
            Update? update;
            try
            {
                update = await JsonSerializer.DeserializeAsync<Update>(Request.Body, JsonBotAPI.Options, ct);
            }
            catch (JsonException)
            {
                return BadRequest();
            }
            if (update is null)
            {
                return BadRequest();
            }

            try
            {
                await handleUpdateService.HandleUpdateAsync(update, ct);
            }
            catch (Exception exception)
            {
                await handleUpdateService.HandleErrorAsync(exception);
            }
            return Ok();
        }
    }
}
