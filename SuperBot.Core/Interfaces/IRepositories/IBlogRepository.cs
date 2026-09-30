using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IBlogRepository
    {
        Task<(IReadOnlyList<BlogPost> Items, long Total)> GetPagedAsync(BlogQueryParameters query);
        Task<(IReadOnlyList<BlogPost> Items, long Total)> GetPublicPagedAsync(BlogQueryParameters query);
        Task<IReadOnlyList<BlogPost>> GetAllAsync();

        /// <summary>
        /// Все теги, которые встречаются в постах. Нужен фильтру в админке: собирать список
        /// из загруженных строк значило бы не предлагать тег, до которого не долистали.
        /// </summary>
        Task<IReadOnlyList<string>> GetAllTagsAsync();
        Task<BlogPost> GetByIdAsync(string id);
        Task<BlogPost> GetBySlugAsync(string slug);
        Task<BlogPost> GetByExternalIdAsync(string externalId);
        Task<IReadOnlyList<BlogPost>> GetByIdsAsync(IEnumerable<string> ids);
        Task<IReadOnlyList<BlogPost>> GetPublishedAsync(int limit);
        Task<IReadOnlyList<BlogPost>> GetEditorsPicksAsync(int limit);
        Task<BlogPost> GetBlogHomeFeaturedAsync();
        Task ClearBlogHomeFeaturedAsync(string exceptPostId = null);
        Task CreateAsync(BlogPost post, BlogPostVersion version);
        Task UpdateAsync(BlogPost post, BlogPostVersion version);
        Task<List<BlogPostVersion>> GetVersionsAsync(string postId);
        Task<BlogPostVersion> GetVersionByIdAsync(string postId, string versionId);
        Task AddVersionAsync(BlogPostVersion version);
    }
}
