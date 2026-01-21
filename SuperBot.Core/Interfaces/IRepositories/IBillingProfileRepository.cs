using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IBillingProfileRepository
    {
        Task<BillingProfile> GetByUserIdAsync(string userId);
        Task UpsertAsync(BillingProfile profile);
    }
}
