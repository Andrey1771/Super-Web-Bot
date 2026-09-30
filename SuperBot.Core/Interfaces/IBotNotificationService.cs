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

    /// <summary>
    /// Platform — площадка ключа (напр. «Steam»), показывается бейджем в письме. Опц.
    /// ProductType, GameId и EditionCode — по ним письмо узнаёт ключ ПО и дописывает лицензию и место активации.
    /// </summary>
    public record DeliveredKeyNotification(
        string GameTitle,
        string Key,
        string? Platform = null,
        string? ProductType = null,
        string? GameId = null,
        string? EditionCode = null);
}
