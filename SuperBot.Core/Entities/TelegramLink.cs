namespace SuperBot.Core.Entities
{
    /// <summary>
    /// Мост между сайтовым аккаунтом (Keycloak) и Telegram-чатом.
    /// Сайтовые заказы/ключи привязаны к sub, wishlist — к email, поэтому храним оба алиаса.
    /// </summary>
    public class TelegramLink
    {
        public string SiteUserId { get; set; } = string.Empty;
        public string? Email { get; set; }
        public long TelegramUserId { get; set; }
        public long ChatId { get; set; }
        public string? Username { get; set; }
        public DateTime LinkedAt { get; set; }
    }

    /// <summary>
    /// Одноразовый токен привязки: сайт выдаёт его залогиненному пользователю,
    /// бот получает его в deep-link (/start &lt;token&gt;) и связывает чат с аккаунтом.
    /// </summary>
    public class TelegramLinkToken
    {
        public string Token { get; set; } = string.Empty;
        public string SiteUserId { get; set; } = string.Empty;
        public string? Email { get; set; }
        public string? DisplayName { get; set; }
        public DateTime ExpiresAt { get; set; }
        public DateTime? ConsumedAt { get; set; }
    }
}
