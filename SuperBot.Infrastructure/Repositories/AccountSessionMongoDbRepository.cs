using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class AccountSessionMongoDbRepository : IAccountSessionRepository
    {
        private readonly IMongoCollection<AccountSessionDb> _collection;

        public AccountSessionMongoDbRepository(IMongoDatabase database)
        {
            _collection = database.GetCollection<AccountSessionDb>("AccountSessions");
        }

        public async Task<List<AccountSession>> GetByUserAsync(string userId)
        {
            var sessions = await _collection.Find(item => item.UserId == userId).ToListAsync();
            return sessions.Select(MapToEntity).OrderByDescending(item => item.LastSeenAt).ToList();
        }

        public async Task<AccountSession?> GetBySessionIdAsync(string userId, string sessionId)
        {
            var sessionDb = await _collection.Find(item => item.UserId == userId && item.SessionId == sessionId).FirstOrDefaultAsync();
            return sessionDb == null ? null : MapToEntity(sessionDb);
        }

        public async Task<AccountSession> UpsertAsync(AccountSession session)
        {
            var sessionDb = MapToDb(session);
            await _collection.ReplaceOneAsync(
                item => item.UserId == sessionDb.UserId && item.SessionId == sessionDb.SessionId,
                sessionDb,
                new ReplaceOptions { IsUpsert = true }
            );
            return MapToEntity(sessionDb);
        }

        public async Task RevokeAsync(string userId, string sessionId)
        {
            await _collection.DeleteOneAsync(item => item.UserId == userId && item.SessionId == sessionId);
        }

        public async Task RevokeAllAsync(string userId, string? sessionToKeep)
        {
            if (string.IsNullOrWhiteSpace(sessionToKeep))
            {
                await _collection.DeleteManyAsync(item => item.UserId == userId);
                return;
            }

            await _collection.DeleteManyAsync(item => item.UserId == userId && item.SessionId != sessionToKeep);
        }

        private static AccountSession MapToEntity(AccountSessionDb db) =>
            new()
            {
                Id = db.Id,
                UserId = db.UserId,
                SessionId = db.SessionId,
                IpAddress = db.IpAddress,
                UserAgent = db.UserAgent,
                DeviceName = db.DeviceName,
                Location = db.Location,
                CreatedAt = db.CreatedAt,
                LastSeenAt = db.LastSeenAt
            };

        private static AccountSessionDb MapToDb(AccountSession session) =>
            new()
            {
                Id = session.Id == Guid.Empty ? Guid.NewGuid() : session.Id,
                UserId = session.UserId,
                SessionId = session.SessionId,
                IpAddress = session.IpAddress,
                UserAgent = session.UserAgent,
                DeviceName = session.DeviceName,
                Location = session.Location,
                CreatedAt = session.CreatedAt,
                LastSeenAt = session.LastSeenAt
            };
    }
}
