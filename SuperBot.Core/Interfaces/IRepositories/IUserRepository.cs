using System.Collections.Generic;
using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IUserRepository
    {
        public Task AddUserAsync(User user);
        public Task<IEnumerable<User>> GetAllUsersAsync();
        public Task<User> GetUserByIdAsync(long userId);
        public Task UpdateUserAsync(User user);
        public Task DeleteUserAsync(string userId);
        public Task<bool> UserExistsAsync(string userId);
        public Task<List<string>> GetWishlistAsync(string userId);
        public Task AddToWishlistAsync(string userId, string gameId);
        public Task RemoveFromWishlistAsync(string userId, string gameId);

        public Task<User> FindByUsernameAsync(string username);
        public Task<IEnumerable<User>> GetAllAsync();
    }
}
