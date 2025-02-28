using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces
{
    public interface ICartRepository
    {
        public Task<List<Cart>> GetAllCartsAsync();

        public Task<List<Cart>> GetCartAsync(string userId);

        // Обновить или объединить корзину
        public Task UpdateCartAsync(string userId, Cart items);

        // Очистить корзину
        public Task ClearCartAsync(string userId);
    }
}
