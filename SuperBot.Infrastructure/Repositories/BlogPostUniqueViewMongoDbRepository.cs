using AutoMapper;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class BlogPostUniqueViewMongoDbRepository : IBlogPostUniqueViewRepository
    {
        private readonly IMongoCollection<BlogPostUniqueViewDb> _views;
        private readonly IMapper _mapper;

        public BlogPostUniqueViewMongoDbRepository(IMongoDatabase database, IMapper mapper)
        {
            _mapper = mapper;
            _views = database.GetCollection<BlogPostUniqueViewDb>("BlogPostUniqueViews");
        }

        public async Task<BlogPostUniqueView> GetByPostAndViewerKeyAsync(string postId, string viewerKey)
        {
            var db = await _views.Find(item => item.PostId == postId && item.ViewerKey == viewerKey).FirstOrDefaultAsync();
            return _mapper.Map<BlogPostUniqueView>(db);
        }

        public async Task CreateAsync(BlogPostUniqueView uniqueView)
        {
            if (string.IsNullOrWhiteSpace(uniqueView.Id))
            {
                uniqueView.Id = ObjectId.GenerateNewId().ToString();
            }

            var db = _mapper.Map<BlogPostUniqueViewDb>(uniqueView);
            await _views.InsertOneAsync(db);
            uniqueView.Id = db.Id;
        }

        public async Task TouchAsync(string id, DateTime viewedAt, string sessionId, string userAgentHash, string ipHash)
        {
            var update = Builders<BlogPostUniqueViewDb>.Update
                .Set(item => item.LastViewedAt, viewedAt)
                .Set(item => item.UpdatedAt, viewedAt)
                .Set(item => item.LastSessionId, sessionId)
                .Set(item => item.UserAgentHash, userAgentHash)
                .Set(item => item.IpHash, ipHash);
            await _views.UpdateOneAsync(item => item.Id == id, update);
        }

        public async Task<Dictionary<string, int>> CountPublicViewsByPostIdsAsync(IEnumerable<string> postIds, bool includeGuestViews)
        {
            var ids = postIds?.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.OrdinalIgnoreCase).ToList() ?? new List<string>();
            if (ids.Count == 0)
            {
                return new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            }

            var filterBuilder = Builders<BlogPostUniqueViewDb>.Filter;
            var filter = filterBuilder.In(item => item.PostId, ids) & filterBuilder.Eq(item => item.IsExcludedFromPublicCounts, false);
            if (!includeGuestViews)
            {
                filter &= filterBuilder.Eq(item => item.IsGuest, false);
            }

            var grouped = await _views.Aggregate()
                .Match(filter)
                .Group(item => item.PostId, group => new { PostId = group.Key, Count = group.Count() })
                .ToListAsync();

            var map = ids.ToDictionary(id => id, _ => 0, StringComparer.OrdinalIgnoreCase);
            foreach (var item in grouped)
            {
                map[item.PostId] = item.Count;
            }
            return map;
        }

        public async Task<int> CountPublicViewsByPostIdAsync(string postId, bool includeGuestViews)
        {
            var map = await CountPublicViewsByPostIdsAsync(new[] { postId }, includeGuestViews);
            return map.TryGetValue(postId, out var count) ? count : 0;
        }

        public async Task<Dictionary<string, int>> GetGuestViewCountsAsync(IEnumerable<string> postIds)
        {
            var ids = postIds?.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.OrdinalIgnoreCase).ToList() ?? new List<string>();
            if (ids.Count == 0)
            {
                return new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            }

            var grouped = await _views.Aggregate()
                .Match(item => ids.Contains(item.PostId) && item.IsGuest && !item.IsExcludedFromPublicCounts)
                .Group(item => item.PostId, group => new { PostId = group.Key, Count = group.Count() })
                .ToListAsync();

            var map = ids.ToDictionary(id => id, _ => 0, StringComparer.OrdinalIgnoreCase);
            foreach (var item in grouped)
            {
                map[item.PostId] = item.Count;
            }
            return map;
        }

        public async Task<long> ExcludeGuestViewsAsync()
        {
            var update = Builders<BlogPostUniqueViewDb>.Update
                .Set(item => item.IsExcludedFromPublicCounts, true)
                .Set(item => item.UpdatedAt, DateTime.UtcNow);
            var result = await _views.UpdateManyAsync(item => item.IsGuest && !item.IsExcludedFromPublicCounts, update);
            return result.ModifiedCount;
        }

        public async Task<long> DeleteGuestViewsAsync()
        {
            var result = await _views.DeleteManyAsync(item => item.IsGuest);
            return result.DeletedCount;
        }

        public async Task<(int PublicUniqueViews, int AuthenticatedUniqueViews, int GuestUniqueViews)> GetGlobalCountersAsync(bool includeGuestViewsInPublicCounts)
        {
            var auth = (int)await _views.CountDocumentsAsync(item => !item.IsGuest && !item.IsExcludedFromPublicCounts);
            var guest = (int)await _views.CountDocumentsAsync(item => item.IsGuest && !item.IsExcludedFromPublicCounts);
            var total = includeGuestViewsInPublicCounts ? auth + guest : auth;
            return (total, auth, guest);
        }
    }
}
