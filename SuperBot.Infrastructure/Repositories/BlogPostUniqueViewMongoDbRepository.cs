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

        public async Task<Dictionary<string, int>> CountPublicViewsByPostIdsAsync(IEnumerable<string> postIds)
        {
            var ids = postIds?.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.OrdinalIgnoreCase).ToList() ?? new List<string>();
            if (ids.Count == 0)
            {
                return new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            }

            var filterBuilder = Builders<BlogPostUniqueViewDb>.Filter;
            var filter = filterBuilder.In(item => item.PostId, ids) & filterBuilder.Eq(item => item.IsExcludedFromPublicCounts, false);
            filter &= filterBuilder.Or(
                filterBuilder.Eq(item => item.IsGuest, false),
                filterBuilder.And(
                    filterBuilder.Eq(item => item.IsGuest, true),
                    filterBuilder.Eq(item => item.CountedInPublicCounts, true)));

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

        public async Task<int> CountPublicViewsByPostIdAsync(string postId)
        {
            var map = await CountPublicViewsByPostIdsAsync(new[] { postId });
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

        public async Task<BlogUniqueViewCounters> GetCountersByPostIdAsync(string postId)
        {
            var map = await GetCountersByPostIdsAsync(new[] { postId });
            return map.TryGetValue(postId, out var counters) ? counters : new BlogUniqueViewCounters();
        }

        public async Task<Dictionary<string, BlogUniqueViewCounters>> GetCountersByPostIdsAsync(IEnumerable<string> postIds)
        {
            var ids = postIds?.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.OrdinalIgnoreCase).ToList() ?? new List<string>();
            if (ids.Count == 0)
            {
                return new Dictionary<string, BlogUniqueViewCounters>(StringComparer.OrdinalIgnoreCase);
            }

            var counters = new Dictionary<string, BlogUniqueViewCounters>(StringComparer.OrdinalIgnoreCase);
            foreach (var id in ids)
            {
                counters[id] = new BlogUniqueViewCounters();
            }

            var filter = Builders<BlogPostUniqueViewDb>.Filter.In(item => item.PostId, ids);
            var grouped = await _views.Aggregate()
                .Match(filter)
                .Group(item => item.PostId, group => new
                {
                    PostId = group.Key,
                    Authenticated = group.Sum(item => !item.IsGuest && !item.IsExcludedFromPublicCounts ? 1 : 0),
                    GuestTotal = group.Sum(item => item.IsGuest ? 1 : 0),
                    GuestCounted = group.Sum(item => item.IsGuest && item.CountedInPublicCounts && !item.IsExcludedFromPublicCounts ? 1 : 0),
                    GuestExcluded = group.Sum(item => item.IsGuest && (item.IsExcludedFromPublicCounts || !item.CountedInPublicCounts) ? 1 : 0)
                })
                .ToListAsync();

            foreach (var item in grouped)
            {
                counters[item.PostId] = new BlogUniqueViewCounters
                {
                    AuthenticatedUniqueViews = item.Authenticated,
                    GuestUniqueViewsTotal = item.GuestTotal,
                    GuestUniqueViewsCounted = item.GuestCounted,
                    GuestUniqueViewsExcluded = item.GuestExcluded,
                    PublicUniqueViews = item.Authenticated + item.GuestCounted
                };
            }

            return counters;
        }

        public async Task<BlogUniqueViewCounters> GetGlobalCountersAsync()
        {
            var aggregate = await _views.Aggregate()
                .Group(item => 1, group => new
                {
                    Authenticated = group.Sum(item => !item.IsGuest && !item.IsExcludedFromPublicCounts ? 1 : 0),
                    GuestTotal = group.Sum(item => item.IsGuest ? 1 : 0),
                    GuestCounted = group.Sum(item => item.IsGuest && item.CountedInPublicCounts && !item.IsExcludedFromPublicCounts ? 1 : 0),
                    GuestExcluded = group.Sum(item => item.IsGuest && (item.IsExcludedFromPublicCounts || !item.CountedInPublicCounts) ? 1 : 0)
                })
                .FirstOrDefaultAsync();

            if (aggregate == null)
            {
                return new BlogUniqueViewCounters();
            }

            return new BlogUniqueViewCounters
            {
                AuthenticatedUniqueViews = aggregate.Authenticated,
                GuestUniqueViewsTotal = aggregate.GuestTotal,
                GuestUniqueViewsCounted = aggregate.GuestCounted,
                GuestUniqueViewsExcluded = aggregate.GuestExcluded,
                PublicUniqueViews = aggregate.Authenticated + aggregate.GuestCounted
            };
        }
    }
}
