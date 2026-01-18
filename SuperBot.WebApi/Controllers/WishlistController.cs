using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class WishlistController(IUserRepository _userRepository, IGameRepository _gameRepository) : ControllerBase
    {
        [HttpGet("{userId}")]
        public async Task<IActionResult> GetWishlist(string userId)
        {
            var wishlistIds = await _userRepository.GetWishlistAsync(userId);
            var games = await _gameRepository.GetByIdsAsync(wishlistIds);

            return Ok(games);
        }

        [HttpPost("{userId}/items")]
        public async Task<IActionResult> AddToWishlist(string userId, [FromBody] WishlistItemRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.GameId))
            {
                return BadRequest("GameId is required.");
            }

            var game = await _gameRepository.GetByIdAsync(request.GameId);
            if (game == null)
            {
                return NotFound();
            }

            await _userRepository.AddToWishlistAsync(userId, request.GameId);
            return NoContent();
        }

        [HttpDelete("{userId}/items/{gameId}")]
        public async Task<IActionResult> RemoveFromWishlist(string userId, string gameId)
        {
            await _userRepository.RemoveFromWishlistAsync(userId, gameId);
            return NoContent();
        }
    }

    public class WishlistItemRequest
    {
        public string GameId { get; set; }
    }
}
