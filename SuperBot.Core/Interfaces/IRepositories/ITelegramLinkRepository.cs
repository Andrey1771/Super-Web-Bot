using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface ITelegramLinkRepository
    {
        /// <summary>Создаёт одноразовый токен привязки для сайтового пользователя.</summary>
        Task<TelegramLinkToken> CreateTokenAsync(string siteUserId, string? email, string? displayName, TimeSpan ttl);

        /// <summary>
        /// Проверяет токен (существует, не истёк, не использован) и связывает Telegram-чат с аккаунтом.
        /// Возвращает созданную привязку либо null, если токен невалиден.
        /// </summary>
        Task<TelegramLink?> ConsumeTokenAndLinkAsync(string token, long telegramUserId, long chatId, string? username);

        /// <summary>Ищет привязку по любому из алиасов пользователя (sub или email).</summary>
        Task<TelegramLink?> GetForUserAsync(IEnumerable<string> aliases);

        /// <summary>Удаляет привязку по любому из алиасов. Возвращает true, если что-то удалено.</summary>
        Task<bool> RemoveForUserAsync(IEnumerable<string> aliases);

        /// <summary>Все привязки (аудитория «linked» для рассылок).</summary>
        Task<List<TelegramLink>> GetAllAsync();
    }
}
