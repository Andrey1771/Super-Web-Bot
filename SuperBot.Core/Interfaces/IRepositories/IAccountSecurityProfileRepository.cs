using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IAccountSecurityProfileRepository
    {
        Task<AccountSecurityProfile?> GetByUserIdAsync(string userId);
        Task<AccountSecurityProfile> UpsertAsync(AccountSecurityProfile profile);
    }
}
