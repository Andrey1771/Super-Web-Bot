using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Events;
using SuperBot.Core.Interfaces;

namespace SuperBot.Infrastructure.Services
{
    /// <summary>
    /// Забирает события из BotOutbox и исполняет их через Telegram-сервисы. Запускается в бот-сервисе.
    /// Опрос коллекции (polling publisher) — простой event-driven без брокера; меняется на очередь при росте.
    /// </summary>
    public class BotOutboxWorker : BackgroundService
    {
        private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(3);
        private const int MaxAttempts = 5;

        private readonly IMongoCollection<BotOutboxEvent> _outbox;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<BotOutboxWorker> _logger;

        public BotOutboxWorker(IMongoClient mongoClient, IConfiguration configuration, IServiceScopeFactory scopeFactory, ILogger<BotOutboxWorker> logger)
        {
            var databaseName = configuration.GetSection("ConnectionStrings:Name").Value;
            _outbox = mongoClient.GetDatabase(databaseName).GetCollection<BotOutboxEvent>("BotOutbox");
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await ProcessBatchAsync(stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "BotOutboxWorker batch failed");
                }

                await Task.Delay(PollInterval, stoppingToken);
            }
        }

        private async Task ProcessBatchAsync(CancellationToken ct)
        {
            while (!ct.IsCancellationRequested)
            {
                // Атомарно забираем одно pending-событие (claim через смену статуса).
                var claimed = await _outbox.FindOneAndUpdateAsync<BotOutboxEvent>(
                    item => item.Status == BotOutboxStatuses.Pending,
                    Builders<BotOutboxEvent>.Update
                        .Set(item => item.Status, "processing")
                        .Inc(item => item.Attempts, 1),
                    new FindOneAndUpdateOptions<BotOutboxEvent> { ReturnDocument = ReturnDocument.After },
                    ct);

                if (claimed == null)
                {
                    return; // очередь пуста
                }

                try
                {
                    await DispatchAsync(claimed, ct);
                    await _outbox.UpdateOneAsync(
                        item => item.Id == claimed.Id,
                        Builders<BotOutboxEvent>.Update
                            .Set(item => item.Status, BotOutboxStatuses.Done)
                            .Set(item => item.ProcessedAt, DateTime.UtcNow),
                        cancellationToken: ct);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "BotOutbox event {Id} ({Type}) failed", claimed.Id, claimed.Type);
                    // Возврат в очередь для ретрая, пока не исчерпаны попытки.
                    var nextStatus = claimed.Attempts >= MaxAttempts ? BotOutboxStatuses.Failed : BotOutboxStatuses.Pending;
                    await _outbox.UpdateOneAsync(
                        item => item.Id == claimed.Id,
                        Builders<BotOutboxEvent>.Update
                            .Set(item => item.Status, nextStatus)
                            .Set(item => item.LastError, ex.Message),
                        cancellationToken: CancellationToken.None);
                }
            }
        }

        private async Task DispatchAsync(BotOutboxEvent evt, CancellationToken ct)
        {
            using var scope = _scopeFactory.CreateScope();
            var provider = scope.ServiceProvider;

            switch (evt.Type)
            {
                case BotEventTypes.KeysDelivered:
                {
                    var payload = JsonSerializer.Deserialize<KeysDeliveredEvent>(evt.PayloadJson)!;
                    var notifier = provider.GetRequiredService<IBotNotificationService>();
                    await notifier.NotifyKeysDeliveredAsync(payload.UserAliases, payload.Keys);
                    break;
                }
                case BotEventTypes.GameDiscountActivated:
                {
                    var payload = JsonSerializer.Deserialize<GameDiscountActivatedEvent>(evt.PayloadJson)!;
                    var alerts = provider.GetRequiredService<IWishlistDiscountAlertService>();
                    await alerts.NotifyGameDiscountAsync(payload.GameId);
                    break;
                }
                case BotEventTypes.SupportEscalation:
                {
                    var payload = JsonSerializer.Deserialize<SupportEscalationEvent>(evt.PayloadJson)!;
                    var support = provider.GetService<ISupportEscalationNotifier>();
                    if (support != null)
                    {
                        await support.NotifyAsync(payload.Text, ct);
                    }
                    break;
                }
                default:
                    _logger.LogWarning("Unknown BotOutbox event type: {Type}", evt.Type);
                    break;
            }
        }
    }
}
