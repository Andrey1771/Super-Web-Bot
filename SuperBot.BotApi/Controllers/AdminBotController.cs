using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.BotApi.Types;
using Telegram.Bot;
using Telegram.Bot.Types.Enums;

namespace SuperBot.BotApi.Controllers
{
    /// <summary>
    /// Статус и управление Telegram-ботом из админки (/admin/bot).
    /// </summary>
    [ApiController]
    [Route("api/admin/bot")]
    [Authorize(Roles = "admin")]
    public class AdminBotController(ITelegramBotClient _bot, IOptions<BotConfiguration> _config, ILogger<AdminBotController> _logger) : ControllerBase
    {
        [HttpGet("status")]
        public async Task<IActionResult> GetStatus(CancellationToken ct)
        {
            var configuredWebhookUrl = _config.Value.BotWebhookUrl?.AbsoluteUri ?? string.Empty;
            var secretConfigured = !string.IsNullOrEmpty(_config.Value.SecretToken);

            try
            {
                var me = await _bot.GetMeAsync(ct);
                var webhook = await _bot.GetWebhookInfoAsync(ct);

                return Ok(new
                {
                    botOk = true,
                    botId = me.Id,
                    botUsername = me.Username,
                    botName = me.FirstName,
                    configuredWebhookUrl,
                    secretConfigured,
                    webhook = new
                    {
                        url = webhook.Url,
                        isSet = !string.IsNullOrEmpty(webhook.Url),
                        matchesConfig = string.Equals(webhook.Url, configuredWebhookUrl, StringComparison.OrdinalIgnoreCase),
                        pendingUpdateCount = webhook.PendingUpdateCount,
                        lastErrorDate = webhook.LastErrorDate,
                        lastErrorMessage = webhook.LastErrorMessage
                    }
                });
            }
            catch (Exception ex)
            {
                // Токен не задан/неверный или Telegram недоступен — статусная страница должна это показать, а не падать.
                _logger.LogWarning(ex, "Bot status check failed");
                return Ok(new
                {
                    botOk = false,
                    error = ex.Message,
                    configuredWebhookUrl,
                    secretConfigured
                });
            }
        }

        [HttpPost("webhook")]
        public async Task<IActionResult> ApplyWebhook(CancellationToken ct)
        {
            var webhookUrl = _config.Value.BotWebhookUrl?.AbsoluteUri;
            if (string.IsNullOrEmpty(webhookUrl))
            {
                return BadRequest("BotConfiguration:BotWebhookUrl is not configured.");
            }

            try
            {
                await _bot.SetWebhookAsync(
                    webhookUrl,
                    allowedUpdates: [],
                    secretToken: string.IsNullOrEmpty(_config.Value.SecretToken) ? null : _config.Value.SecretToken,
                    cancellationToken: ct);

                var webhook = await _bot.GetWebhookInfoAsync(ct);
                return Ok(new { message = $"Webhook set to {webhookUrl}", url = webhook.Url });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to set Telegram webhook");
                return StatusCode(StatusCodes.Status502BadGateway, $"Telegram API error: {ex.Message}");
            }
        }

        /// <summary>
        /// Рассылка в Telegram: segment "linked" — привязавшие аккаунт, "all" — все, кто запускал бота.
        /// </summary>
        [HttpPost("broadcast")]
        public async Task<IActionResult> Broadcast(
            [FromBody] BroadcastRequest request,
            [FromServices] ITelegramLinkRepository linkRepository,
            [FromServices] IUserRepository userRepository,
            CancellationToken ct)
        {
            var message = request?.Message?.Trim();
            if (string.IsNullOrEmpty(message))
            {
                return BadRequest("Message is required.");
            }
            if (message.Length > 4000)
            {
                return BadRequest("Message is too long (Telegram limit is 4096 characters).");
            }

            var segment = string.IsNullOrWhiteSpace(request!.Segment) ? "linked" : request.Segment.Trim().ToLowerInvariant();

            // Собираем chatId аудитории. Для личных чатов chatId == telegram userId.
            var chatIds = new HashSet<long>();
            if (segment is "linked" or "all")
            {
                foreach (var link in await linkRepository.GetAllAsync())
                {
                    chatIds.Add(link.ChatId);
                }
            }
            if (segment == "all")
            {
                foreach (var user in await userRepository.GetAllUsersAsync())
                {
                    if (user.UserId > 0)
                    {
                        chatIds.Add(user.UserId);
                    }
                }
            }
            if (segment is not ("linked" or "all"))
            {
                return BadRequest("Unknown segment. Use \"linked\" or \"all\".");
            }

            var sent = 0;
            var failed = 0;
            foreach (var chatId in chatIds)
            {
                ct.ThrowIfCancellationRequested();
                try
                {
                    await _bot.SendTextMessageAsync(chatId, message, parseMode: ParseMode.Html, cancellationToken: ct);
                    sent++;
                }
                catch (Exception ex)
                {
                    // Пользователь заблокировал бота и т.п. — считаем и продолжаем.
                    _logger.LogWarning(ex, "Broadcast send failed for chat {ChatId}", chatId);
                    failed++;
                }

                // Бережём лимиты Telegram (~30 сообщений/сек).
                await Task.Delay(40, ct);
            }

            return Ok(new { segment, total = chatIds.Count, sent, failed });
        }

        [HttpDelete("webhook")]
        public async Task<IActionResult> RemoveWebhook(CancellationToken ct)
        {
            try
            {
                await _bot.DeleteWebhookAsync(cancellationToken: ct);
                return Ok(new { message = "Webhook removed" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to delete Telegram webhook");
                return StatusCode(StatusCodes.Status502BadGateway, $"Telegram API error: {ex.Message}");
            }
        }

        public class BroadcastRequest
        {
            public string Message { get; set; } = string.Empty;
            public string Segment { get; set; } = "linked";
        }
    }
}
