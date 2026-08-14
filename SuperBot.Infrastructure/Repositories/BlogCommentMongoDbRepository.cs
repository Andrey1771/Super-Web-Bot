using AutoMapper;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class BlogCommentMongoDbRepository : IBlogCommentRepository
    {
        private readonly IMongoCollection<BlogCommentDb> _comments;
        private readonly IMongoCollection<BlogCommentBanDb> _bans;
        private readonly IMapper _mapper;

        public BlogCommentMongoDbRepository(IMongoDatabase database, IMapper mapper)
        {
            _mapper = mapper;
            _comments = database.GetCollection<BlogCommentDb>("BlogComments");
            _bans = database.GetCollection<BlogCommentBanDb>("BlogCommentBans");
        }

        // Видимость через «!= Hidden», а не «== Visible»: у ранних документов поля
        // status нет вовсе, и они должны оставаться видимыми.
        private static FilterDefinition<BlogCommentDb> VisibleFilter(string postId) =>
            Builders<BlogCommentDb>.Filter.Eq(item => item.PostId, postId) &
            Builders<BlogCommentDb>.Filter.Ne(item => item.Status, BlogCommentStatus.Hidden);

        public async Task CreateAsync(BlogComment comment)
        {
            if (string.IsNullOrWhiteSpace(comment.Id))
            {
                comment.Id = ObjectId.GenerateNewId().ToString();
            }

            var db = _mapper.Map<BlogCommentDb>(comment);
            await _comments.InsertOneAsync(db);
            comment.Id = db.Id;
        }

        public async Task<IReadOnlyList<BlogComment>> GetByPostAsync(string postId, int skip, int take)
        {
            var commentsDb = await _comments
                .Find(VisibleFilter(postId))
                .SortByDescending(item => item.CreatedAt)
                .Skip(skip)
                .Limit(take)
                .ToListAsync();

            return _mapper.Map<IReadOnlyList<BlogComment>>(commentsDb);
        }

        public async Task<long> CountByPostAsync(string postId)
        {
            return await _comments.CountDocumentsAsync(VisibleFilter(postId));
        }

        private static FilterDefinition<BlogCommentDb> StatusFilter(string status)
        {
            if (string.IsNullOrWhiteSpace(status))
            {
                return Builders<BlogCommentDb>.Filter.Empty;
            }

            return string.Equals(status, BlogCommentStatus.Hidden, StringComparison.OrdinalIgnoreCase)
                ? Builders<BlogCommentDb>.Filter.Eq(item => item.Status, BlogCommentStatus.Hidden)
                : Builders<BlogCommentDb>.Filter.Ne(item => item.Status, BlogCommentStatus.Hidden);
        }

        public async Task<IReadOnlyList<BlogComment>> GetPagedAsync(int skip, int take, string status = null)
        {
            var commentsDb = await _comments
                .Find(StatusFilter(status))
                .SortByDescending(item => item.CreatedAt)
                .Skip(skip)
                .Limit(take)
                .ToListAsync();

            return _mapper.Map<IReadOnlyList<BlogComment>>(commentsDb);
        }

        public async Task<long> CountAsync(string status = null)
        {
            return await _comments.CountDocumentsAsync(StatusFilter(status));
        }

        public async Task<long> CountRecentByActorAsync(string userId, string anonId, DateTime fromUtc)
        {
            var filterBuilder = Builders<BlogCommentDb>.Filter;
            var actorFilters = new List<FilterDefinition<BlogCommentDb>>();
            if (!string.IsNullOrWhiteSpace(userId))
            {
                actorFilters.Add(filterBuilder.Eq(item => item.UserId, userId));
            }
            if (!string.IsNullOrWhiteSpace(anonId))
            {
                actorFilters.Add(filterBuilder.Eq(item => item.AnonId, anonId));
            }

            if (actorFilters.Count == 0)
            {
                return 0;
            }

            var filter = filterBuilder.Or(actorFilters) & filterBuilder.Gte(item => item.CreatedAt, fromUtc);
            return await _comments.CountDocumentsAsync(filter);
        }

        public async Task<bool> SetStatusAsync(string id, string status)
        {
            var update = Builders<BlogCommentDb>.Update.Set(item => item.Status, status);
            var result = await _comments.UpdateOneAsync(item => item.Id == id, update);
            return result.MatchedCount > 0;
        }

        public async Task<bool> DeleteAsync(string id)
        {
            var result = await _comments.DeleteOneAsync(item => item.Id == id);
            return result.DeletedCount > 0;
        }

        public async Task<BlogComment> GetByIdAsync(string id)
        {
            var commentDb = await _comments.Find(item => item.Id == id).FirstOrDefaultAsync();
            return commentDb == null ? null : _mapper.Map<BlogComment>(commentDb);
        }

        public async Task<bool> IsAuthorBannedAsync(string userId)
        {
            if (string.IsNullOrWhiteSpace(userId))
            {
                return false;
            }

            return await _bans.CountDocumentsAsync(item => item.UserId == userId) > 0;
        }

        public async Task<IReadOnlyCollection<string>> GetBannedUserIdsAsync(IEnumerable<string> userIds)
        {
            var ids = userIds?.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.OrdinalIgnoreCase).ToList()
                      ?? new List<string>();
            if (ids.Count == 0)
            {
                return Array.Empty<string>();
            }

            var banned = await _bans
                .Find(Builders<BlogCommentBanDb>.Filter.In(item => item.UserId, ids))
                .Project(item => item.UserId)
                .ToListAsync();

            return banned.ToHashSet(StringComparer.OrdinalIgnoreCase);
        }

        public async Task BanAuthorAsync(string userId, string bannedBy)
        {
            // Идемпотентно: повторный бан просто обновляет запись, а не плодит дубли.
            var update = Builders<BlogCommentBanDb>.Update
                .Set(item => item.BannedBy, bannedBy)
                .SetOnInsert(item => item.Id, ObjectId.GenerateNewId().ToString())
                .SetOnInsert(item => item.CreatedAt, DateTime.UtcNow);
            await _bans.UpdateOneAsync(item => item.UserId == userId, update, new UpdateOptions { IsUpsert = true });
        }

        public async Task<bool> UnbanAuthorAsync(string userId)
        {
            var result = await _bans.DeleteOneAsync(item => item.UserId == userId);
            return result.DeletedCount > 0;
        }
    }
}
