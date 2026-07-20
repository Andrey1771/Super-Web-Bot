using Microsoft.Extensions.Logging;
using SuperBot.Core.Interfaces;
using Telegram.Bot;

namespace SuperBot.BotApi.Services
{
    /// <summary>
    /// Отправляет готовый текст эскалации поддержки в Telegram-чат админа. Bot-side реализация
    /// события SupportEscalation — сайт лишь публикует событие, Telegram не трогает.
    /// </summary>
    public class SupportEscalationNotifier(
        ITelegramBotClient _bot,
        IAdminSettingsProvider _adminSettings,
        ILogger<SupportEscalationNotifier> _logger) : ISupportEscalationNotifier
    {
        public async Task NotifyAsync(string text, CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(text) || _adminSettings.AdminChatId == 0)
            {
                return; // нет текста или не задан admin-чат — уведомлять некуда
            }

            try
            {
                // Plain text (без parse mode): транскрипт может содержать символы, ломающие Markdown.
                await _bot.SendTextMessageAsync(_adminSettings.AdminChatId, text, cancellationToken: cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to send Telegram escalation notification");
            }
        }
    }
}
