namespace SuperBot.Core.Interfaces
{
    /// <summary>
    /// Уведомляет специалиста в Telegram об эскалации ИИ-чата. Реализация живёт в бот-сервисе;
    /// сайт лишь публикует событие SupportEscalation в outbox.
    /// </summary>
    public interface ISupportEscalationNotifier
    {
        Task NotifyAsync(string summary, CancellationToken cancellationToken);
    }
}
