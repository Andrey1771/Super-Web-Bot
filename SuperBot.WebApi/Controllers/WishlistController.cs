using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;

namespace SuperBot.WebApi.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class WishlistController(IWishlistRepository _wishlistRepository) : ControllerBase
    {
        [HttpGet("{userId}")]
        public async Task<IActionResult> GetWishlist(string userId)
        {
            var wishlist = (await _wishlistRepository.GetWishlistAsync(userId)).FirstOrDefault();

            return Ok(wishlist);
        }

        [HttpGet]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> GetAllWishlists()
        {
            var wishlists = await _wishlistRepository.GetAllWishlistsAsync();

            return Ok(wishlists);
        }

        [HttpPost("{userId}")]
        public async Task<IActionResult> UpdateWishlist(string userId, [FromBody] Wishlist wishlist)
        {
            await _wishlistRepository.UpdateWishlistAsync(userId, wishlist);
            return Ok();
        }

        [HttpDelete("{userId}")]
        public async Task<IActionResult> ClearWishlist(string userId)
        {
            await _wishlistRepository.ClearWishlistAsync(userId);
            return NoContent();
        }
    }
}
