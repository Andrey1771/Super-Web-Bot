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
        public async Task<IActionResult> Post([FromBody] Update update, [FromServices] TelegramUpdateHandler handleUpdateService, CancellationToken ct)
        {
            // Секрет из настройки вебхука: чужие POST-ы отбрасываем.
            var secretToken = Config.Value.SecretToken;
            if (!string.IsNullOrEmpty(secretToken) &&
                Request.Headers["X-Telegram-Bot-Api-Secret-Token"] != secretToken)
            {
                return Forbid();
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
