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

            var userDb = _mapper.Map<UserDb>(user);
            await _usersCollection.InsertOneAsync(userDb);
        }

        // Получение всех пользователей
        public async Task<IEnumerable<User>> GetAllUsersAsync()
        {
            var usersDb = await _usersCollection.Find(_ => true).ToListAsync();
            return _mapper.Map<IEnumerable<User>>(usersDb);
        }

        // Получение пользователя по идентификатору
        public async Task<User> GetUserByIdAsync(long userId)
        {
            var userDb = await _usersCollection.Find(u => u.UserId == userId.ToString()).FirstOrDefaultAsync();
            return _mapper.Map<User>(userDb);
        }

        // Обновление данных пользователя
        public async Task UpdateUserAsync(User user)
        {
            user.UpdatedAt = DateTime.UtcNow;

            var filter = Builders<UserDb>.Filter.Eq(u => u.UserId, user.UserId.ToString());
            var update = Builders<UserDb>.Update
                .Set(u => u.Username, user.Username)
                .Set(u => u.Balance, user.Balance)
                .Set(u => u.CountOfInvited, user.CountOfInvited)
                .Set(u => u.Discount, user.Discount)
                .Set(u => u.QuantityBeforeIncrease, user.QuantityBeforeIncrease)
                .Set(u => u.UpdatedAt, DateTime.UtcNow);

            await _usersCollection.UpdateOneAsync(filter, update);
        }

        // Удаление пользователя по идентификатору
        public async Task DeleteUserAsync(string userId)
        {
            var filter = Builders<UserDb>.Filter.Eq(u => u.UserId, userId);
            await _usersCollection.DeleteOneAsync(filter);
        }

        // Проверка, существует ли пользователь с данным userId
        public async Task<bool> UserExistsAsync(string userId)
        {
            var count = await _usersCollection.CountDocumentsAsync(u => u.UserId == userId);
            return count > 0;
        }
    }
}
