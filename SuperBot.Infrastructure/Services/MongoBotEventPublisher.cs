using System.Text.Json;
using Microsoft.Extensions.Configuration;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;

namespace SuperBot.Infrastructure.Services
{
    /// <summary>Пишет события в коллекцию BotOutbox. Забирает и исполняет их бот-сервис (BotOutboxWorker).</summary>
    public class MongoBotEventPublisher : IBotEventPublisher
    {
        private readonly IMongoCollection<BotOutboxEvent> _outbox;

        public MongoBotEventPublisher(IMongoClient mongoClient, IConfiguration configuration)
        {
            var databaseName = configuration.GetSection("ConnectionStrings:Name").Value;
            _outbox = mongoClient.GetDatabase(databaseName).GetCollection<BotOutboxEvent>("BotOutbox");
        }

        public async Task PublishAsync(string type, object payload)
        {
            var evt = new BotOutboxEvent
            {
                Type = type,
                PayloadJson = JsonSerializer.Serialize(payload),
                Status = BotOutboxStatuses.Pending,
                CreatedAt = DateTime.UtcNow
            };
            await _outbox.InsertOneAsync(evt);
        }
    }
}
