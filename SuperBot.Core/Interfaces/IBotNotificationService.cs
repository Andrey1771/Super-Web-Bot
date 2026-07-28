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

    /// <summary>Platform — площадка ключа (напр. «Steam»), показывается бейджем в письме. Опц.</summary>
    public record DeliveredKeyNotification(string GameTitle, string Key, string? Platform = null);
}
