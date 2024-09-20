using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Options;
using SuperBot.WebApi.Services;
using SuperBot.WebApi.Types;
using Telegram.Bot;
using Telegram.Bot.Types;

namespace SuperBot.WebApi.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class TelegramController(IOptions<BotConfiguration> Config, IStringLocalizer<TelegramController> localizer) : ControllerBase
    {
        [HttpGet("setWebhook")]
        public async Task<string> SetWebHook([FromServices] ITelegramBotClient bot, CancellationToken ct)
        {
            var webhookUrl = Config.Value.BotWebhookUrl.AbsoluteUri;
            await bot.SetWebhookAsync(webhookUrl, allowedUpdates: [], secretToken: Config.Value.SecretToken, cancellationToken: ct);
            return $"Webhook set to {webhookUrl}";
        }

        [HttpPost]
        public async Task<IActionResult> Post([FromBody] Update update, [FromServices] ITelegramBotClient bot, [FromServices] UpdateHandler handleUpdateService, CancellationToken ct)
        {
            if (Request.Headers["X-Telegram-Bot-Api-Secret-Token"] != Config.Value.SecretToken)
                return Forbid();
            try
            {
                await handleUpdateService.HandleUpdateAsync(bot, update, ct);
            }
            catch (Exception exception)
            {
                await handleUpdateService.HandleErrorAsync(bot, exception, Telegram.Bot.Polling.HandleErrorSource.HandleUpdateError, ct);
            }
            return Ok();
        }
    }
}
