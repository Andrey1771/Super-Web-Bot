using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class GameTrackingMongoDbRepository : IGameTrackingRepository
    {
        private readonly IMongoCollection<GameTrackingEventDb> _events;

        public GameTrackingMongoDbRepository(IMongoDatabase database)
        {
            _events = database.GetCollection<GameTrackingEventDb>("GameTrackingEvents");
        }

        public async Task AddEventAsync(GameTrackingEvent trackingEvent)
        {
            var db = new GameTrackingEventDb
            {
                GameId = trackingEvent.GameId,
                UserId = trackingEvent.UserId,
                AnonId = trackingEvent.AnonId,
                EventType = trackingEvent.EventType,
                MediaId = trackingEvent.MediaId,
                MediaType = trackingEvent.MediaType,
                Timestamp = trackingEvent.Timestamp
            };

            await _events.InsertOneAsync(db);
            trackingEvent.Id = db.Id;
        }
    }
}
