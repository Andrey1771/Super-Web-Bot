namespace SuperBot.Core.Interfaces
{
    /// <summary>Отправка уведомлений пользователю в Telegram (если он привязал аккаунт).</summary>
    public interface IBotNotificationService
    {
        /// <summary>
        /// Доставляет купленные ключи в личный чат пользователя.
        /// Тихо ничего не делает, если пользователь не привязал Telegram.
        /// </summary>
        Task NotifyKeysDeliveredAsync(IEnumerable<string> userAliases, IEnumerable<DeliveredKeyNotification> keys);
    }

    public record DeliveredKeyNotification(string GameTitle, string Key);
}
