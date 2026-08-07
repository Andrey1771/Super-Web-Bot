using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IDealOfWeekSettingsRepository
    {
        Task<DealOfWeekSettings?> GetAsync();
        Task<DealOfWeekSettings> UpsertAsync(DealOfWeekSettings settings);
    }
}
