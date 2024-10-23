using AutoMapper;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class UserMongoDbRepository : IUserRepository
    {
        private readonly IMongoCollection<UserDb> _usersCollection;
        private readonly IMapper _mapper;

        public UserMongoDbRepository(IMongoDatabase database, IMapper mapper)
        {
            _mapper = mapper;
            _usersCollection = database.GetCollection<UserDb>("Users");
        }

        public async Task<User> GetUserDetailsAsync(string userId)
        {
            var user = await _usersCollection.Find(u => u.UserId == userId).FirstOrDefaultAsync();
            return _mapper.Map<User>(user);
        }
    }
}
