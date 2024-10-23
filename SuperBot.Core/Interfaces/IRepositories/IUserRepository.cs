using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IUserRepository
    {
        Task<User> GetUserDetailsAsync(string userId);
    }
}
