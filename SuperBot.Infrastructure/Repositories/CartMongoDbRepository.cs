using AutoMapper;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class CartMongoDbRepository : ICartRepository
    {
        private readonly IMongoCollection<CartItemDb> _cartCollection;
        private readonly IMapper _mapper;

        public CartMongoDbRepository(IMongoDatabase database, IMapper mapper)
        {
            _mapper = mapper;
            _cartCollection = database.GetCollection<CartItemDb>("CartItems");
        }

        // Получить корзину для пользователя
        public async Task<List<CartItem>> GetCartAsync(string userId) {

            var cartItems = await _cartCollection.Find(item => item.UserId == userId).ToListAsync();
            return _mapper.Map<List<CartItem>>(cartItems);
    }

        // Обновить или объединить корзину
        public async Task UpdateCartAsync(string userId, List<CartItem> items)
        {
            foreach (var item in items)
            {
                var existingItem = await _cartCollection
                    .Find(i => i.UserId == userId && i.Name == item.Name)
                    .FirstOrDefaultAsync();

                if (existingItem != null)
                {
                    // Обновляем количество
                    existingItem.Quantity += item.Quantity;
                    await _cartCollection.ReplaceOneAsync(i => i.Id == existingItem.Id, existingItem);
                }
                else
                {
                    // Добавляем новый товар
                    item.UserId = userId;
                    await _cartCollection.InsertOneAsync(_mapper.Map<CartItemDb>(item));
                }
            }
        }

        // Очистить корзину
        public async Task ClearCartAsync(string userId) =>
            await _cartCollection.DeleteManyAsync(item => item.UserId == userId);
    }
}
