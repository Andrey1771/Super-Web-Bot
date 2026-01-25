using AutoMapper;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

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
