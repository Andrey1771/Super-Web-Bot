using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IUserRepository
    {
        Task<User> GetUserDetailsAsync(long userId);
        Task AddUserAsync(User user);                    // Добавление нового пользователя
        Task UpdateUserAsync(User user);                 // Обновление данных пользователя
        Task<bool> UserExistsAsync(string userId);       // Проверка, существует ли пользователь
    }
}
