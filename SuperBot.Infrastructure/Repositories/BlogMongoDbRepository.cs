using AutoMapper;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;
using System;

namespace SuperBot.Infrastructure.Repositories
{
    public class BlogMongoDbRepository : IBlogRepository
    {
        private readonly IMongoCollection<BlogPostDb> _posts;
        private readonly IMongoCollection<BlogPostVersionDb> _versions;
        private readonly IMapper _mapper;

        public BlogMongoDbRepository(IMongoDatabase database, IMapper mapper)
        {
            _mapper = mapper;
            _posts = database.GetCollection<BlogPostDb>("BlogPosts");
            _versions = database.GetCollection<BlogPostVersionDb>("BlogPostVersions");
        }

        public async Task<(IReadOnlyList<BlogPost> Items, long Total)> GetPagedAsync(BlogQueryParameters query)
        {
            var filter = BuildFilter(query, includeOnlyPublished: false);
            return await QueryAsync(filter, query);
        }

        public async Task<(IReadOnlyList<BlogPost> Items, long Total)> GetPublicPagedAsync(BlogQueryParameters query)
        {
            var filter = BuildFilter(query, includeOnlyPublished: true);
            return await QueryAsync(filter, query);
        }

        public async Task<IReadOnlyList<BlogPost>> GetAllAsync()
        {
            var postsDb = await _posts
                .Find(Builders<BlogPostDb>.Filter.Empty)
                .SortByDescending(post => post.UpdatedAt)
                .ToListAsync();

            return _mapper.Map<IReadOnlyList<BlogPost>>(postsDb);
        }

        public async Task<BlogPost> GetByIdAsync(string id)
        {
            var postDb = await _posts.Find(post => post.Id == id).FirstOrDefaultAsync();
            return _mapper.Map<BlogPost>(postDb);
        }

        public async Task<BlogPost> GetBySlugAsync(string slug)
        {
            var postDb = await _posts.Find(post => post.Slug == slug).FirstOrDefaultAsync();
            return _mapper.Map<BlogPost>(postDb);
        }

        public async Task<BlogPost> GetByExternalIdAsync(string externalId)
        {
            if (string.IsNullOrWhiteSpace(externalId))
            {
                return null;
            }

            var postDb = await _posts.Find(post => post.ExternalId == externalId).FirstOrDefaultAsync();
            return _mapper.Map<BlogPost>(postDb);
        }

        public async Task<IReadOnlyList<BlogPost>> GetByIdsAsync(IEnumerable<string> ids)
        {
            var idList = ids?.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct().ToList() ?? new List<string>();
            if (idList.Count == 0)
            {
                return Array.Empty<BlogPost>();
            }

            var filter = Builders<BlogPostDb>.Filter.In(post => post.Id, idList);
            var postsDb = await _posts.Find(filter).ToListAsync();
            return _mapper.Map<IReadOnlyList<BlogPost>>(postsDb);
        }

        public async Task<IReadOnlyList<BlogPost>> GetPublishedAsync(int limit)
        {
            var normalizedLimit = Math.Clamp(limit, 1, 50);
            var postsDb = await _posts
                .Find(post => post.Status == "PUBLISHED")
                .SortByDescending(post => post.PublishedAt)
                .Limit(normalizedLimit)
                .ToListAsync();

            return _mapper.Map<IReadOnlyList<BlogPost>>(postsDb);
        }

        public async Task<IReadOnlyList<BlogPost>> GetPublishedSinceAsync(DateTime fromUtc)
        {
            var filter = Builders<BlogPostDb>.Filter.And(
                Builders<BlogPostDb>.Filter.Eq(post => post.Status, "PUBLISHED"),
                Builders<BlogPostDb>.Filter.Gte(post => post.PublishedAt, fromUtc)
            );

            var postsDb = await _posts
                .Find(filter)
                .SortByDescending(post => post.PublishedAt)
                .ToListAsync();

            return _mapper.Map<IReadOnlyList<BlogPost>>(postsDb);
        }

        public async Task<IReadOnlyList<BlogPost>> GetEditorsPicksAsync(int limit)
        {
            var normalizedLimit = Math.Clamp(limit, 1, 50);
            var filter = Builders<BlogPostDb>.Filter.And(
                Builders<BlogPostDb>.Filter.Eq(post => post.Status, "PUBLISHED"),
                Builders<BlogPostDb>.Filter.Or(
                    Builders<BlogPostDb>.Filter.Eq(post => post.Featured, true),
                    Builders<BlogPostDb>.Filter.Gt(post => post.EditorScore, 0)
                )
            );

            var postsDb = await _posts
                .Find(filter)
                .SortByDescending(post => post.EditorScore)
                .ThenByDescending(post => post.PublishedAt)
                .Limit(normalizedLimit)
                .ToListAsync();

            return _mapper.Map<IReadOnlyList<BlogPost>>(postsDb);
        }

        public async Task<BlogPost> GetBlogHomeFeaturedAsync()
        {
            var filter = Builders<BlogPostDb>.Filter.And(
                Builders<BlogPostDb>.Filter.Eq(post => post.Status, "PUBLISHED"),
                Builders<BlogPostDb>.Filter.Eq(post => post.BlogHomeFeatured, true)
            );

            var postDb = await _posts
                .Find(filter)
                .SortByDescending(post => post.UpdatedAt)
                .FirstOrDefaultAsync();

            return _mapper.Map<BlogPost>(postDb);
        }

        public async Task ClearBlogHomeFeaturedAsync(string exceptPostId = null)
        {
            var filter = Builders<BlogPostDb>.Filter.Eq(post => post.BlogHomeFeatured, true);

            if (!string.IsNullOrWhiteSpace(exceptPostId))
            {
                filter = Builders<BlogPostDb>.Filter.And(
                    filter,
                    Builders<BlogPostDb>.Filter.Ne(post => post.Id, exceptPostId)
                );
            }

            var update = Builders<BlogPostDb>.Update.Set(post => post.BlogHomeFeatured, false);
            await _posts.UpdateManyAsync(filter, update);
        }

        public async Task CreateAsync(BlogPost post, BlogPostVersion version)
        {
            if (string.IsNullOrWhiteSpace(post.Id))
            {
                post.Id = ObjectId.GenerateNewId().ToString();
            }
            version.PostId = post.Id;

            var versionDb = _mapper.Map<BlogPostVersionDb>(version);
            await _versions.InsertOneAsync(versionDb);
            version.Id = versionDb.Id;

            post.CurrentVersionId = version.Id;
            var postDb = _mapper.Map<BlogPostDb>(post);
            await _posts.InsertOneAsync(postDb);
        }

        public async Task UpdateAsync(BlogPost post, BlogPostVersion version)
        {
            var versionDb = _mapper.Map<BlogPostVersionDb>(version);
            await _versions.InsertOneAsync(versionDb);
            version.Id = versionDb.Id;

            post.CurrentVersionId = version.Id;
            var postDb = _mapper.Map<BlogPostDb>(post);
            await _posts.ReplaceOneAsync(item => item.Id == postDb.Id, postDb);
        }

        public async Task<List<BlogPostVersion>> GetVersionsAsync(string postId)
        {
            var versions = await _versions
                .Find(version => version.PostId == postId)
                .SortByDescending(version => version.VersionNumber)
                .ToListAsync();

            return _mapper.Map<List<BlogPostVersion>>(versions);
        }

        public async Task<BlogPostVersion> GetVersionByIdAsync(string postId, string versionId)
        {
            var version = await _versions
                .Find(item => item.PostId == postId && item.Id == versionId)
                .FirstOrDefaultAsync();

            return _mapper.Map<BlogPostVersion>(version);
        }

        public async Task AddVersionAsync(BlogPostVersion version)
        {
            var versionDb = _mapper.Map<BlogPostVersionDb>(version);
            await _versions.InsertOneAsync(versionDb);
            version.Id = versionDb.Id;
        }

        private static FilterDefinition<BlogPostDb> BuildFilter(BlogQueryParameters query, bool includeOnlyPublished)
        {
            var filter = Builders<BlogPostDb>.Filter.Empty;

            if (includeOnlyPublished)
            {
                filter &= Builders<BlogPostDb>.Filter.Eq(post => post.Status, "PUBLISHED");
            }
            else if (!string.IsNullOrWhiteSpace(query.Status))
            {
                filter &= Builders<BlogPostDb>.Filter.Eq(post => post.Status, query.Status.ToUpperInvariant());
            }

            if (!string.IsNullOrWhiteSpace(query.Search))
            {
                var regex = new BsonRegularExpression(query.Search, "i");
                var searchFilter = Builders<BlogPostDb>.Filter.Or(
                    Builders<BlogPostDb>.Filter.Regex(post => post.Title, regex),
                    Builders<BlogPostDb>.Filter.Regex(post => post.Slug, regex)
                );
                filter &= searchFilter;
            }

            if (!string.IsNullOrWhiteSpace(query.Tag))
            {
                filter &= Builders<BlogPostDb>.Filter.AnyEq(post => post.Tags, query.Tag);
            }

            if (query.Featured.HasValue)
            {
                filter &= Builders<BlogPostDb>.Filter.Eq(post => post.Featured, query.Featured.Value);
            }

            return filter;
        }

        private async Task<(IReadOnlyList<BlogPost> Items, long Total)> QueryAsync(FilterDefinition<BlogPostDb> filter, BlogQueryParameters query)
        {
            var total = await _posts.CountDocumentsAsync(filter);

            var page = query.Page < 1 ? 1 : query.Page;
            var pageSize = query.PageSize is < 1 or > 100 ? 12 : query.PageSize;
            var sort = query.Sort?.ToLowerInvariant() == "createdat:asc"
                ? Builders<BlogPostDb>.Sort.Ascending(post => post.CreatedAt)
                : Builders<BlogPostDb>.Sort.Descending(post => post.UpdatedAt);

            var postsDb = await _posts
                .Find(filter)
                .Sort(sort)
                .Skip((page - 1) * pageSize)
                .Limit(pageSize)
                .ToListAsync();

            return (_mapper.Map<IReadOnlyList<BlogPost>>(postsDb), total);
        }
    }
}
