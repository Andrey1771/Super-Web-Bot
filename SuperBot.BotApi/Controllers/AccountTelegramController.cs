using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using SuperBot.Core.Interfaces.IRepositories;
using Telegram.Bot;

namespace SuperBot.BotApi.Controllers
{
    /// <summary>
    /// Привязка Telegram к сайтовому аккаунту через deep-link (?start=&lt;token&gt;).
    /// </summary>
    [ApiController]
    [Authorize]
    [Route("api/account/telegram")]
    public class AccountTelegramController(
        ITelegramLinkRepository _linkRepository,
        ITelegramBotClient _bot,
        IMemoryCache _cache,
        ILogger<AccountTelegramController> _logger) : ControllerBase
    {
        private static readonly TimeSpan TokenTtl = TimeSpan.FromMinutes(15);

        [HttpGet("status")]
        public async Task<IActionResult> GetStatus()
        {
            var link = await _linkRepository.GetForUserAsync(GetAliases());
            if (link == null)
            {
                return Ok(new { linked = false });
            }

            return Ok(new
            {
                linked = true,
                username = link.Username,
                telegramUserId = link.TelegramUserId,
                linkedAt = link.LinkedAt
            });
        }

        [HttpPost("link-token")]
        public async Task<IActionResult> CreateLinkToken()
        {
            var (userId, email, displayName) = GetIdentity();
            if (string.IsNullOrWhiteSpace(userId))
            {
                return Unauthorized();
            }

            var botUsername = await GetBotUsernameAsync();
            if (string.IsNullOrWhiteSpace(botUsername))
            {
                return StatusCode(StatusCodes.Status503ServiceUnavailable, "Bot is not configured.");
            }

            var token = await _linkRepository.CreateTokenAsync(userId, email, displayName, TokenTtl);
            var deepLink = $"https://t.me/{botUsername}?start={token.Token}";

            return Ok(new
            {
                deepLink,
                botUsername,
                expiresAt = token.ExpiresAt
            });
        }

        [HttpDelete]
        public async Task<IActionResult> Unlink()
        {
            var removed = await _linkRepository.RemoveForUserAsync(GetAliases());
            return Ok(new { removed });
        }

        private async Task<string?> GetBotUsernameAsync()
        {
            if (_cache.TryGetValue<string>("bot:username", out var cached) && !string.IsNullOrEmpty(cached))
            {
                return cached;
            }

            try
            {
                var me = await _bot.GetMeAsync();
                if (!string.IsNullOrWhiteSpace(me.Username))
                {
                    _cache.Set("bot:username", me.Username, TimeSpan.FromHours(6));
                    return me.Username;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not resolve bot username from Telegram");
            }

            return null;
        }

        private (string UserId, string? Email, string? DisplayName) GetIdentity()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? string.Empty;
            var email = User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email");
            var displayName = User.FindFirstValue("preferred_username")
                ?? User.FindFirstValue(ClaimTypes.Name)
                ?? User.FindFirstValue("name");
            return (userId, email, displayName);
        }

        private IEnumerable<string> GetAliases()
        {
            var (userId, email, _) = GetIdentity();
            var aliases = new List<string>();
            if (!string.IsNullOrWhiteSpace(userId)) aliases.Add(userId);
            if (!string.IsNullOrWhiteSpace(email)) aliases.Add(email);
            return aliases;
        }
    }
}
