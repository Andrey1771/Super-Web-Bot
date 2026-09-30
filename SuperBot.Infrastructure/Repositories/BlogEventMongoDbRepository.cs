using SuperBot.Infrastructure.Mapping;
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

        /// <summary>
        /// Считает разных читателей по каждой статье одной агрегацией.
        ///
        /// Ключ читателя собирается тем же правилом, что и в приложении (аккаунт → анонимный
        /// идентификатор → сессия), но прямо в базе: иначе пришлось бы поднимать в память все
        /// события каждой статьи, чтобы посчитать по ним Distinct.
        /// </summary>
        public async Task<Dictionary<string, int>> CountDistinctActorsByPostsAsync(
            IEnumerable<string> postIds,
            string eventType,
            DateTime fromUtc)
        {
            var ids = postIds?
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Distinct(StringComparer.Ordinal)
                .ToList() ?? new List<string>();
            var result = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            if (ids.Count == 0 || string.IsNullOrWhiteSpace(eventType))
            {
                return result;
            }

            // Непустое поле после обрезки пробелов — то же, что string.IsNullOrWhiteSpace в коде.
            static BsonDocument Filled(string field) => new BsonDocument("$gt", new BsonArray
            {
                new BsonDocument("$strLenCP", new BsonDocument("$trim", new BsonDocument("input",
                    new BsonDocument("$ifNull", new BsonArray { "$" + field, "" })))),
                0
            });

            static BsonDocument Prefixed(string prefix, string field) =>
                new BsonDocument("$concat", new BsonArray { prefix, "$" + field });

            var actor = new BsonDocument("$switch", new BsonDocument
            {
                { "branches", new BsonArray
                    {
                        new BsonDocument { { "case", Filled("userId") }, { "then", Prefixed("u:", "userId") } },
                        new BsonDocument { { "case", Filled("anonId") }, { "then", Prefixed("a:", "anonId") } },
                        new BsonDocument { { "case", Filled("sessionId") }, { "then", Prefixed("s:", "sessionId") } }
                    }
                },
                { "default", "" }
            });

            var pipeline = new[]
            {
                new BsonDocument("$match", new BsonDocument
                {
                    { "postId", new BsonDocument("$in", new BsonArray(ids)) },
                    { "eventType", eventType },
                    { "ts", new BsonDocument("$gte", fromUtc) }
                }),
                new BsonDocument("$group", new BsonDocument("_id", new BsonDocument
                {
                    { "postId", "$postId" },
                    { "actor", actor }
                })),
                // Событие без единого идентификатора не принадлежит никому — такое не считаем.
                new BsonDocument("$match", new BsonDocument("_id.actor", new BsonDocument("$ne", ""))),
                new BsonDocument("$group", new BsonDocument
                {
                    { "_id", "$_id.postId" },
                    { "count", new BsonDocument("$sum", 1) }
                })
            };

            var rows = await _events.Aggregate<BsonDocument>(pipeline).ToListAsync();
            foreach (var row in rows)
            {
                var postId = row.GetValue("_id", BsonNull.Value);
                if (postId.IsBsonNull)
                {
                    continue;
                }
                result[postId.AsString] = row.GetValue("count", 0).ToInt32();
            }
            return result;
        }

        public async Task<IReadOnlyList<BlogEvent>> GetRecentByPostAsync(string postId, DateTime fromUtc)
        {
            var eventsDb = await _events
                .Find(item => item.PostId == postId && item.Timestamp >= fromUtc)
                .SortByDescending(item => item.Timestamp)
                .ToListAsync();
            return _mapper.Map<IReadOnlyList<BlogEvent>>(eventsDb);
        }

    }
}
