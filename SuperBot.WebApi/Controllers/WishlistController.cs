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
    public class WishlistController(IWishlistRepository _wishlistRepository, IGameRepository _gameRepository) : ControllerBase
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
            return Ok(await KeepExistingAsync(currentUserId, wishlistIds));
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

            // Запись на несуществующую игру не создаём: её нельзя ни показать, ни купить.
            var games = await _gameRepository.GetByIdsAsync(new[] { request.GameId });
            if (games.Count == 0)
            {
                return NotFound();
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
            return Ok(new { gameIds = await KeepExistingAsync(currentUserId, mergedIds) });
        }

        /// <summary>
        /// Только игры, которые есть в каталоге. Записи об удалённых играх тут же убираются:
        /// раньше они оставались навсегда, и счётчик «Saved items» показывал больше, чем страница
        /// списка могла вывести (на стенде 7 против 4). Новые такие записи не появятся — их чистит
        /// и удаление игры, — а этот путь долечивает те, что накопились до исправления.
        /// </summary>
        private async Task<HashSet<string>> KeepExistingAsync(string userId, IReadOnlyCollection<string> ids)
        {
            if (ids.Count == 0)
            {
                return new HashSet<string>();
            }

            var existing = (await _gameRepository.GetByIdsAsync(ids))
                .Select(game => game.Id)
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .ToHashSet();

            foreach (var missing in ids.Where(id => !existing.Contains(id)))
            {
                await _wishlistRepository.RemoveAsync(userId, missing);
            }

            return ids.Where(existing.Contains).ToHashSet();
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
