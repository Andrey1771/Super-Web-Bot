using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IBlogViewSettingsRepository
    {
        Task<BlogViewSettings> GetAsync();
        Task<BlogViewSettings> UpsertAsync(BlogViewSettings settings);
    }
}
