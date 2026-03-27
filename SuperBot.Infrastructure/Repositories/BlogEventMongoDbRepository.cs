using AutoMapper;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class BlogEventMongoDbRepository : IBlogEventRepository
    {
        private readonly IMongoCollection<BlogEventDb> _events;
        private readonly IMapper _mapper;

        public BlogEventMongoDbRepository(IMongoDatabase database, IMapper mapper)
        {
            _mapper = mapper;
            _events = database.GetCollection<BlogEventDb>("BlogEvents");
        }

        public async Task CreateAsync(BlogEvent blogEvent)
        {
            if (string.IsNullOrWhiteSpace(blogEvent.Id))
            {
                blogEvent.Id = ObjectId.GenerateNewId().ToString();
            }

            var db = _mapper.Map<BlogEventDb>(blogEvent);
            await _events.InsertOneAsync(db);
            blogEvent.Id = db.Id;
        }

        public async Task<IReadOnlyList<BlogEvent>> GetRecentSinceAsync(DateTime fromUtc)
        {
            var eventsDb = await _events
                .Find(item => item.Timestamp >= fromUtc)
                .SortByDescending(item => item.Timestamp)
                .ToListAsync();

            return _mapper.Map<IReadOnlyList<BlogEvent>>(eventsDb);
        }

        public async Task<IReadOnlyList<BlogEvent>> GetRecentByPostAsync(string postId, DateTime fromUtc)
        {
            var eventsDb = await _events
                .Find(item => item.PostId == postId && item.Timestamp >= fromUtc)
                .SortByDescending(item => item.Timestamp)
                .ToListAsync();
            return _mapper.Map<IReadOnlyList<BlogEvent>>(eventsDb);
        }

        public async Task<IReadOnlyList<BlogEvent>> GetRecentByUserAsync(string userId, int limit)
        {
            if (string.IsNullOrWhiteSpace(userId))
            {
                return Array.Empty<BlogEvent>();
            }

            var eventsDb = await _events
                .Find(item => item.UserId == userId)
                .SortByDescending(item => item.Timestamp)
                .Limit(limit)
                .ToListAsync();

            return _mapper.Map<IReadOnlyList<BlogEvent>>(eventsDb);
        }

        public async Task<IReadOnlyList<BlogEvent>> GetRecentByAnonAsync(string anonId, int limit)
        {
            if (string.IsNullOrWhiteSpace(anonId))
            {
                return Array.Empty<BlogEvent>();
            }

            var eventsDb = await _events
                .Find(item => item.AnonId == anonId)
                .SortByDescending(item => item.Timestamp)
                .Limit(limit)
                .ToListAsync();

            return _mapper.Map<IReadOnlyList<BlogEvent>>(eventsDb);
        }
    }
}
