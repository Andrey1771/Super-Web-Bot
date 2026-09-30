using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Interfaces.IRepositories;
using System.Linq;
using System.Security.Claims;
using SuperBot.Common.Auth;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Authorize]
    [Route("api/wishlist")]
    public class WishlistController(IWishlistRepository _wishlistRepository) : ControllerBase
    {
        [HttpGet]
        public async Task<IActionResult> GetWishlist()
        {
            var currentUserId = User.GetUserKey();
            if (string.IsNullOrWhiteSpace(currentUserId))
            {
                return Unauthorized();
            }

            var wishlistIds = await _wishlistRepository.GetGameIdsAsync(currentUserId);
            return Ok(wishlistIds);
        }

        [HttpPost("items")]
        public async Task<IActionResult> AddToWishlist([FromBody] WishlistItemRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.GameId))
            {
                return BadRequest("GameId is required.");
            }

            var currentUserId = User.GetUserKey();
            if (string.IsNullOrWhiteSpace(currentUserId))
            {
                return Unauthorized();
            }

            await _wishlistRepository.AddAsync(currentUserId, request.GameId);
            return Ok();
        }

        [HttpDelete("items/{gameId}")]
        public async Task<IActionResult> RemoveFromWishlist(string gameId)
        {
            var currentUserId = User.GetUserKey();
            if (string.IsNullOrWhiteSpace(currentUserId))
            {
                return Unauthorized();
            }

            await _wishlistRepository.RemoveAsync(currentUserId, gameId);
            return Ok();
        }

        [HttpPost("merge")]
        public async Task<IActionResult> MergeWishlist([FromBody] MergeWishlistRequest request)
        {
            var currentUserId = User.GetUserKey();
            if (string.IsNullOrWhiteSpace(currentUserId))
            {
                return Unauthorized();
            }

            var mergedIds = await _wishlistRepository.MergeAsync(currentUserId, request.GameIds ?? Enumerable.Empty<string>());
            return Ok(new { gameIds = mergedIds });
        }

    }

    public class WishlistItemRequest
    {
        public string GameId { get; set; }
    }

    public class MergeWishlistRequest
    {
        public List<string> GameIds { get; set; } = new();
    }
}
