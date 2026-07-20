namespace SuperBot.Core.Interfaces
{
    /// <summary>
    /// Публикация событий для бот-сервиса (outbox). Сайт вызывает это вместо прямой работы с Telegram.
    /// </summary>
    public interface IBotEventPublisher
    {
        Task PublishAsync(string type, object payload);
    }
}
