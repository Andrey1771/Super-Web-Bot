using AutoMapper;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class CartMongoDbRepository : ICartRepository
    {
        private readonly IMongoCollection<CartDb> _cartCollection;
        private readonly IMapper _mapper;

        public CartMongoDbRepository(IMongoDatabase database, IMapper mapper)
        {
            _mapper = mapper;
            _cartCollection = database.GetCollection<CartDb>("Cart");
        }

        // Получить корзину для пользователя
        public async Task<List<Cart>> GetCartAsync(string userId)
        {

            var cartItems = await _cartCollection.Find(item => item.UserId == userId).ToListAsync();
            return _mapper.Map<List<Cart>>(cartItems);
        }

        // Обновить или объединить корзину
        public async Task UpdateCartAsync(string userId, Cart cart)
        {
            var existingItem = (await _cartCollection
                .Find(i => i.UserId == userId)
                .FirstOrDefaultAsync());

            var cartDb = _mapper.Map<CartDb>(cart);

            if (existingItem != null)
            {
                cartDb.Id = existingItem.Id;
                await _cartCollection.ReplaceOneAsync(i => i.Id == existingItem.Id, cartDb);
            }
            else
            {
                await _cartCollection.InsertOneAsync(_mapper.Map<CartDb>(cart));
            }
        }

        // Очистить корзину
        public async Task ClearCartAsync(string userId) =>
            await _cartCollection.DeleteManyAsync(item => item.UserId == userId);
    }
}
