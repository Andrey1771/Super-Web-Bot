using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IBlogRepository
    {
        Task<(IReadOnlyList<BlogPost> Items, long Total)> GetPagedAsync(BlogQueryParameters query);
        Task<(IReadOnlyList<BlogPost> Items, long Total)> GetPublicPagedAsync(BlogQueryParameters query);
        Task<IReadOnlyList<BlogPost>> GetAllAsync();
        Task<BlogPost> GetByIdAsync(string id);
        Task<BlogPost> GetBySlugAsync(string slug);
        Task<BlogPost> GetByExternalIdAsync(string externalId);
        Task CreateAsync(BlogPost post, BlogPostVersion version);
        Task UpdateAsync(BlogPost post, BlogPostVersion version);
        Task<List<BlogPostVersion>> GetVersionsAsync(string postId);
        Task<BlogPostVersion> GetVersionByIdAsync(string postId, string versionId);
        Task AddVersionAsync(BlogPostVersion version);
    }
}
