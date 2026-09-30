using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.BotApi.Types;
using Telegram.Bot;
using Telegram.Bot.Exceptions;
using Telegram.Bot.Types.Enums;

namespace SuperBot.BotApi.Controllers
{
    /// <summary>
    /// Статус и управление Telegram-ботом из админки (/admin/bot).
    /// </summary>
    [ApiController]
    [Route("api/admin/bot")]
    [Authorize(Roles = "admin")]
    public class AdminBotController(
        ITelegramBotClient _bot,
        IOptions<BotConfiguration> _config,
        IHttpClientFactory _httpClientFactory,
        SuperBot.BotApi.Services.WebhookHealthChecker _webhookHealth,
        ILogger<AdminBotController> _logger) : ControllerBase
    {
        /// <summary>
        /// Диагноз вебхука одной строкой — для сводки здоровья в админке сайта.
        ///
        /// Дашборд раньше проверял этот сервис обычной пробой и засчитывал даже 401: то есть
        /// отвечал на вопрос «поднят ли контейнер». Ломается же вебхук, и ломается отдельно —
        /// контейнер при этом совершенно жив. Здесь отдаётся именно то, чего там не хватало.
        /// </summary>
        [HttpGet("webhook-health")]
        [AllowAnonymous]
        public async Task<IActionResult> GetWebhookHealth(
            [FromServices] IConfiguration configuration,
            CancellationToken ct)
        {
            // Два входа: админ с правами из браузера и наш же фоновый монитор с внутренним
            // токеном — у него пользователя нет вовсе. Пустой токен ничего не открывает:
            // при незаполненной настройке остаётся только проверка прав.
            var expected = configuration["Internal:ServiceToken"];
            var presented = Request.Headers["X-Internal-Token"].ToString();
            var internalCall = !string.IsNullOrWhiteSpace(expected) && presented == expected;

            if (!internalCall && !(User.Identity?.IsAuthenticated == true && User.IsInRole("admin")))
            {
                return Unauthorized();
            }

            if (!_webhookHealth.IsConfigured)
            {
                return Ok(new { diagnosis = "NotConfigured", message = SuperBot.BotApi.Services.BotTokenGuard.MissingTokenMessage });
            }

            try
            {
                var report = await _webhookHealth.CheckAsync(ct);
                return Ok(new { diagnosis = report.Diagnosis.ToString(), message = report.Message });
            }
            catch (Exception ex)
            {
                // Недоступный Telegram — не «вебхук сломан», а «спросить не удалось».
                // Смешивать эти два ответа нельзя: чинить их надо в разных местах.
                _logger.LogWarning(ex, "Webhook health check failed");
                return Ok(new { diagnosis = "Unknown", message = $"Could not ask Telegram: {ex.Message}" });
            }
        }

        [HttpGet("status")]
        public async Task<IActionResult> GetStatus(CancellationToken ct)
        {
            var configuredWebhookUrl = _config.Value.BotWebhookUrl?.AbsoluteUri ?? string.Empty;
            var secretConfigured = !string.IsNullOrEmpty(_config.Value.SecretToken);

            try
            {
                var me = await _bot.GetMe(ct);
                var webhook = await _bot.GetWebhookInfo(ct);

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

        /// <summary>
        /// Самопроверка бота: пять шагов от токена до настоящего запроса снаружи.
        ///
        /// Нужна потому, что «Connected» на странице означает лишь «токен верный». Между этим
        /// и «бот слышит людей» лежит ещё несколько условий, и каждое ломается по-своему:
        /// адрес не тот, секрет не совпал, туннель умер. Проверяем их по очереди и говорим,
        /// какое именно не выполнено.
        /// </summary>
        [HttpGet("selftest")]
        public async Task<IActionResult> SelfTest(CancellationToken ct)
        {
            var checks = new List<object>();
            void Add(string name, bool ok, string detail) => checks.Add(new { name, ok, detail });

            // 1. Токен.
            string? botUsername = null;
            try
            {
                var me = await _bot.GetMe(ct);
                botUsername = me.Username;
                Add("Bot token", true, $"@{me.Username} (id {me.Id})");
            }
            catch (Exception ex)
            {
                Add("Bot token", false, ex.Message);
                return Ok(new { ok = false, checks });
            }

            // 2. Адрес вебхука в настройках.
            var configured = _config.Value.BotWebhookUrl?.AbsoluteUri;
            var httpsOk = !string.IsNullOrEmpty(configured)
                && string.Equals(_config.Value.BotWebhookUrl!.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase);
            Add("Webhook address", httpsOk,
                string.IsNullOrEmpty(configured)
                    ? "not configured"
                    : httpsOk ? configured : $"{configured} — Telegram needs https");

            // 3. Что зарегистрировано у Telegram и не жалуется ли он на доставку.
            var registeredMatches = false;
            try
            {
                var webhook = await _bot.GetWebhookInfo(ct);
                registeredMatches = !string.IsNullOrEmpty(webhook.Url)
                    && string.Equals(webhook.Url, configured, StringComparison.OrdinalIgnoreCase);

                Add("Registered in Telegram", registeredMatches,
                    string.IsNullOrEmpty(webhook.Url)
                        ? "no webhook registered — press Apply webhook"
                        : registeredMatches ? webhook.Url : $"registered {webhook.Url}, but the app expects {configured}");

                // Очередь и последняя ошибка доставки — это Telegram сообщает о НАШЕЙ стороне.
                Add("Delivery", string.IsNullOrEmpty(webhook.LastErrorMessage),
                    string.IsNullOrEmpty(webhook.LastErrorMessage)
                        ? $"queue {webhook.PendingUpdateCount}, no errors"
                        : $"queue {webhook.PendingUpdateCount}, last error: {webhook.LastErrorMessage}");
            }
            catch (Exception ex)
            {
                Add("Registered in Telegram", false, ex.Message);
            }

            // 4. Главная проверка: доходит ли запрос снаружи до приёмника. Стучимся по тому же
            // публичному адресу и с тем же секретом, что и Telegram. 200 здесь означает, что
            // работает вся цепочка: туннель или домен, nginx, маршрут и проверка секрета.
            if (httpsOk)
            {
                try
                {
                    using var http = _httpClientFactory.CreateClient();
                    http.Timeout = TimeSpan.FromSeconds(10);
                    using var probe = new HttpRequestMessage(HttpMethod.Post, configured)
                    {
                        // Пустое обновление: приёмник его примет и пропустит — обработчик
                        // напишет в лог «unsupported update», ничего не делая.
                        Content = new StringContent("{\"update_id\":0}", System.Text.Encoding.UTF8, "application/json")
                    };
                    if (!string.IsNullOrEmpty(_config.Value.SecretToken))
                    {
                        probe.Headers.Add("X-Telegram-Bot-Api-Secret-Token", _config.Value.SecretToken);
                    }

                    using var response = await http.SendAsync(probe, ct);
                    Add("Reachable from outside", response.IsSuccessStatusCode,
                        response.IsSuccessStatusCode
                            ? "the webhook endpoint answered 200"
                            : $"the address answered {(int)response.StatusCode} — check the tunnel or domain");
                }
                catch (Exception ex)
                {
                    Add("Reachable from outside", false, ex.Message);
                }
            }

            // 5. Секрет: без него адрес принимает что угодно от кого угодно.
            Add("Webhook secret", !string.IsNullOrEmpty(_config.Value.SecretToken),
                string.IsNullOrEmpty(_config.Value.SecretToken)
                    ? "not set — anyone who learns the address can post fake updates"
                    : "set");

            var ok = checks.All(check => (bool)check.GetType().GetProperty("ok")!.GetValue(check)!);
            return Ok(new { ok, bot = botUsername, checks });
        }

        [HttpPost("webhook")]
        public async Task<IActionResult> ApplyWebhook(CancellationToken ct)
        {
            var webhookUrl = _config.Value.BotWebhookUrl?.AbsoluteUri;
            if (string.IsNullOrEmpty(webhookUrl))
            {
                return BadRequest("BotConfiguration:BotWebhookUrl is not configured.");
            }

            // Telegram принимает вебхук только по HTTPS и только на адрес, до которого
            // дотянется сам. Проверяем это до запроса: ответ Telegram («bad webhook: An
            // HTTPS URL must be provided») не объясняет, что делать, а на localhost эта
            // кнопка не заработает никогда — нужен публичный адрес или туннель.
            //
            // Опроса (getUpdates) в проекте нет: обновления приходят только вебхуком,
            // поэтому без него бот не получает ни сообщений, ни нажатий кнопок.
            if (!string.Equals(_config.Value.BotWebhookUrl!.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(
                    $"Telegram accepts webhooks over HTTPS only, and {webhookUrl} is not. "
                    + "On a local machine expose the site through a tunnel (ngrok, cloudflared) and put "
                    + "that https address into BOT_WEBHOOK_URL; on the server set PUBLIC_URL to your domain "
                    + "and the webhook address is built from it. Until then the bot receives nothing: "
                    + "this project has no polling mode, updates arrive through the webhook only.");
            }

            try
            {
                await _bot.SetWebhook(
                    webhookUrl,
                    allowedUpdates: [],
                    secretToken: string.IsNullOrEmpty(_config.Value.SecretToken) ? null : _config.Value.SecretToken,
                    cancellationToken: ct);

                var webhook = await _bot.GetWebhookInfo(ct);
                return Ok(new { message = $"Webhook set to {webhookUrl}", url = webhook.Url });
            }
            catch (ApiRequestException ex)
            {
                // Telegram ответил и отказал — виноват наш запрос, а не связь. 502 здесь
                // означало бы «внешняя система сломалась», и чинить пошли бы не то.
                _logger.LogWarning(ex, "Telegram rejected the webhook URL {Url}", webhookUrl);
                return BadRequest($"Telegram rejected the webhook: {ex.Message}");
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
                    await _bot.SendMessage(chatId, message, parseMode: ParseMode.Html, cancellationToken: ct);
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
                await _bot.DeleteWebhook(cancellationToken: ct);
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
