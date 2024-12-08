using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces
{
    public interface ICartRepository
    {
        public Task<List<CartItem>> GetCartAsync(string userId);

        // Обновить или объединить корзину
        public Task UpdateCartAsync(string userId, List<CartItem> items);

        // Очистить корзину
        public Task ClearCartAsync(string userId);
    }
}
