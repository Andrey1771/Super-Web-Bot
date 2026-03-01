using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IBlogHomepageSettingsRepository
    {
        Task<BlogHomepageSettings> GetAsync();
        Task<BlogHomepageSettings> UpsertAsync(BlogHomepageSettings settings);
    }
}
