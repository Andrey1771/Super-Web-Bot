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

        // Добавление нового пользователя в коллекцию
        public async Task AddUserAsync(User user)
        {
            user.CreatedAt = DateTime.UtcNow;
            user.UpdatedAt = DateTime.UtcNow;

            await _usersCollection.InsertOneAsync(_mapper.Map<UserDb>(user));
        }

        public async Task<User> GetUserDetailsAsync(long userId)
        {
            var user = await _usersCollection.Find(u => u.UserId == userId.ToString()).FirstOrDefaultAsync();
            return _mapper.Map<User>(user);
        }

        // Обновление данных пользователя
        public async Task UpdateUserAsync(User user)
        {
            user.UpdatedAt = DateTime.UtcNow;
            var filter = Builders<UserDb>.Filter.Eq(u => u.UserId, user.UserId.ToString());
            var update = Builders<UserDb>.Update
                .Set(u => u.Name, user.Username)
                .Set(u => u.Balance, user.Balance)
                .Set(u => u.CountOfInvited, user.CountOfInvited)
                .Set(u => u.Discount, user.Discount)
                .Set(u => u.QuantityBeforeIncrease, user.QuantityBeforeIncrease)
                .Set(u => u.UpdatedAt, DateTime.UtcNow)
                .Set(u => u.ChoseSteamLogin, user.ChoseSteamLogin)
                .Set(u => u.Username, user.Username);


            await _usersCollection.UpdateOneAsync(filter, update);
        }

        // Проверка, существует ли пользователь с данным userId
        public async Task<bool> UserExistsAsync(string userId)
        {
            var count = await _usersCollection.CountDocumentsAsync(u => u.UserId == userId);
            return count > 0;
        }
    }
}
