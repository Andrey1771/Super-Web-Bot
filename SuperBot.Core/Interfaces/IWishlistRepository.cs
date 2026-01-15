using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces
{
    public interface IWishlistRepository
    {
        Task<List<Wishlist>> GetAllWishlistsAsync();
        Task<List<Wishlist>> GetWishlistAsync(string userId);
        Task UpdateWishlistAsync(string userId, Wishlist items);
        Task ClearWishlistAsync(string userId);
    }
}
