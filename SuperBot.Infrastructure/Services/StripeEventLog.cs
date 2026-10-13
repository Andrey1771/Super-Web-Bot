using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Services
{
    /// <summary>
    /// Защита от повторной обработки одного и того же события Stripe.
    /// Stripe доставляет события «хотя бы один раз»: сетевой сбой при ответе — и то же самое
    /// событие придёт снова. Запись делается ТОЛЬКО после успешной обработки, поэтому
    /// неудачная попытка не «съедает» событие и Stripe сможет его повторить.
    /// </summary>
    public interface IStripeEventLog
    {
        Task<bool> IsProcessedAsync(string eventId);
        Task MarkProcessedAsync(string eventId, string eventType);
    }

    public class StripeEventLog : IStripeEventLog
    {
        private readonly IMongoCollection<StripeWebhookEventDb> _events;
        private readonly ILogger<StripeEventLog> _logger;

        public StripeEventLog(IMongoDatabase database, ILogger<StripeEventLog> logger)
        {
            _events = database.GetCollection<StripeWebhookEventDb>("StripeWebhookEvents");
            _logger = logger;
        }

        public async Task<bool> IsProcessedAsync(string eventId)
        {
            if (string.IsNullOrWhiteSpace(eventId))
            {
                return false;
            }

            return await _events.Find(item => item.EventId == eventId).AnyAsync();
        }

        public async Task MarkProcessedAsync(string eventId, string eventType)
        {
            if (string.IsNullOrWhiteSpace(eventId))
            {
                return;
            }

            try
            {
                await _events.InsertOneAsync(new StripeWebhookEventDb
                {
                    EventId = eventId,
                    EventType = eventType,
                    ProcessedAt = DateTime.UtcNow
                });
            }
            catch (MongoWriteException ex) when (ex.WriteError?.Category == ServerErrorCategory.DuplicateKey)
            {
                // Параллельная доставка того же события успела записаться первой — это нормально.
                _logger.LogDebug("Stripe event {EventId} was already marked as processed.", eventId);
            }
        }
    }
}
