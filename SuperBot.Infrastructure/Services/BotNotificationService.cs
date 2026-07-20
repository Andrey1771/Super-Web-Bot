using System.Text;
using Microsoft.Extensions.Logging;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using Telegram.Bot;
using Telegram.Bot.Types.Enums;

namespace SuperBot.Infrastructure.Services
{
    public class BotNotificationService(
        ITelegramLinkRepository _linkRepository,
        ITelegramBotClient _bot,
        ITranslationsService _translationsService,
        ILogger<BotNotificationService> _logger) : IBotNotificationService
    {
        public async Task NotifyKeysDeliveredAsync(IEnumerable<string> userAliases, IEnumerable<DeliveredKeyNotification> keys)
        {
            var keyList = keys?.Where(item => !string.IsNullOrWhiteSpace(item.Key)).ToList() ?? new();
            if (keyList.Count == 0)
            {
                return;
            }

            var aliases = (userAliases ?? Enumerable.Empty<string>()).ToList();

            // Stars-покупка: userId = "tg:<chatId>" — чат известен напрямую, привязка не нужна.
            var chatId = ResolveDirectChatId(aliases);
            if (chatId == null)
            {
                var link = await _linkRepository.GetForUserAsync(aliases);
                chatId = link?.ChatId;
            }

            if (chatId == null)
            {
                // Пользователь не привязал Telegram — доставка в чат не требуется (ключи уже в аккаунте на сайте).
                return;
            }

            var message = BuildMessage(keyList);

            try
            {
                await _bot.SendTextMessageAsync(chatId.Value, message, parseMode: ParseMode.Html);
            }
            catch (Exception ex)
            {
                // Доставка в чат — best-effort: ключи в любом случае доступны в кабинете на сайте.
                _logger.LogWarning(ex, "Failed to deliver keys to Telegram chat {ChatId}", chatId.Value);
            }
        }

        private string BuildMessage(IReadOnlyList<DeliveredKeyNotification> keys)
        {
            var builder = new StringBuilder();
            var header = _translationsService.Translation.KeysDeliveredHeader;
            builder.AppendLine(string.IsNullOrWhiteSpace(header) ? "🔑 Your keys:" : header);
            builder.AppendLine();

            foreach (var item in keys)
            {
                builder.AppendLine($"<b>{Escape(item.GameTitle)}</b>");
                builder.AppendLine($"<code>{Escape(item.Key)}</code>");
                builder.AppendLine();
            }

            return builder.ToString().TrimEnd();
        }

        // Псевдо-алиас "tg:<chatId>" (Stars-покупки) — сразу даёт chatId без обращения к привязкам.
        private static long? ResolveDirectChatId(IEnumerable<string> aliases)
        {
            foreach (var alias in aliases)
            {
                if (!string.IsNullOrWhiteSpace(alias) &&
                    alias.StartsWith("tg:", StringComparison.OrdinalIgnoreCase) &&
                    long.TryParse(alias.AsSpan(3), out var chatId))
                {
                    return chatId;
                }
            }
            return null;
        }

        private static string Escape(string value) =>
            string.IsNullOrEmpty(value)
                ? string.Empty
                : value.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");
    }
}
