using AutoMapper;
using MongoDB.Driver;
using MongoDB.Driver.Linq;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class WishlistMongoDbRepository : IWishlistRepository
    {
        private readonly IMongoCollection<WishlistDb> _wishlistCollection;
        private readonly IMapper _mapper;

        public WishlistMongoDbRepository(IMongoDatabase database, IMapper mapper)
        {
            _mapper = mapper;
            _wishlistCollection = database.GetCollection<WishlistDb>("Wishlist");
        }

        public async Task<List<Wishlist>> GetAllWishlistsAsync()
        {
            var wishlists = await _wishlistCollection.AsQueryable().ToListAsync();
            return _mapper.Map<List<Wishlist>>(wishlists);
        }

        public async Task<List<Wishlist>> GetWishlistAsync(string userId)
        {
            var wishlistItems = await _wishlistCollection.Find(item => item.UserId == userId).ToListAsync();
            return _mapper.Map<List<Wishlist>>(wishlistItems);
        }

        public async Task UpdateWishlistAsync(string userId, Wishlist items)
        {
            var existingItem = await _wishlistCollection
                .Find(item => item.UserId == userId)
                .FirstOrDefaultAsync();

            var wishlistDb = _mapper.Map<WishlistDb>(items);

            if (existingItem != null)
            {
                wishlistDb.Id = existingItem.Id;
                await _wishlistCollection.ReplaceOneAsync(item => item.Id == existingItem.Id, wishlistDb);
            }
            else
            {
                await _wishlistCollection.InsertOneAsync(_mapper.Map<WishlistDb>(items));
            }
        }

        public async Task ClearWishlistAsync(string userId) =>
            await _wishlistCollection.DeleteManyAsync(item => item.UserId == userId);
    }
}
