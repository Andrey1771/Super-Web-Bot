using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IAnalyticsSettingsRepository
    {
        Task<AnalyticsSettings> GetAsync();
        Task<AnalyticsSettings> UpsertAsync(AnalyticsSettings settings);
    }
}
