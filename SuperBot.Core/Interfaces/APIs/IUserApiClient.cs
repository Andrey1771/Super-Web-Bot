using SuperBot.Core.Entities;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

namespace SuperBot.Core.Interfaces.APIs
{
    public interface IUserApiClient
    {
        public Task<IEnumerable<User>> GetAllUsersAsync();
        public Task<User> GetUserByIdAsync(string id);
        public Task CreateUserAsync(User newUser);
        public Task UpdateUserAsync(string id, User updatedUser);
        public Task DeleteUserAsync(string id);
    }
}
