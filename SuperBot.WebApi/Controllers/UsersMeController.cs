using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using System;
using System.Security.Claims;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Authorize]
    [Route("api/users/me")]
    public class UsersMeController : ControllerBase
    {
        private readonly IViewedGameRepository _viewedGameRepository;
        private readonly IGameKeyRepository _gameKeyRepository;
        private readonly IGameRepository _gameRepository;
        private readonly IRecommendationsService _recommendationsService;
        private readonly IMemoryCache _memoryCache;
        private readonly ILogger<UsersMeController> _logger;

        public UsersMeController(
            IViewedGameRepository viewedGameRepository,
            IGameKeyRepository gameKeyRepository,
            IGameRepository gameRepository,
            IRecommendationsService recommendationsService,
            IMemoryCache memoryCache,
            ILogger<UsersMeController> logger)
        {
            _viewedGameRepository = viewedGameRepository;
            _gameKeyRepository = gameKeyRepository;
            _gameRepository = gameRepository;
            _recommendationsService = recommendationsService;
            _memoryCache = memoryCache;
            _logger = logger;
        }

        [HttpPost("viewed/{gameId}")]
        public async Task<IActionResult> AddViewedGame(string gameId, [FromBody] ViewedGameRequest request = null)
        {
            if (string.IsNullOrWhiteSpace(gameId))
            {
                return BadRequest("GameId is required.");
            }

            var currentUserId = GetCurrentUserId();
            if (string.IsNullOrWhiteSpace(currentUserId))
            {
                return Unauthorized();
            }

            await _viewedGameRepository.UpsertAsync(currentUserId, gameId, request?.Source);
            return Ok();
        }

        [HttpGet("viewed")]
        public async Task<IActionResult> GetViewedGames([FromQuery] int limit = 12)
        {
            var currentUserId = GetCurrentUserId();
            if (string.IsNullOrWhiteSpace(currentUserId))
            {
                return Unauthorized();
            }

            var normalizedLimit = Math.Clamp(limit, 1, 50);
            var viewedGames = await _viewedGameRepository.GetRecentAsync(currentUserId, normalizedLimit);
            if (viewedGames.Count == 0)
            {
                return Ok(Array.Empty<ViewedGameResponse>());
            }

            var gameIds = viewedGames.Select(item => item.GameId).Distinct().ToList();
            var games = await _gameRepository.GetByIdsAsync(gameIds);
            var gameMap = games.Where(game => !string.IsNullOrWhiteSpace(game.Id))
                .ToDictionary(game => game.Id, game => game);

            var response = viewedGames
                .Where(item => gameMap.ContainsKey(item.GameId))
                .Select(item => new ViewedGameResponse
                {
                    Game = gameMap[item.GameId],
                    LastViewedAt = item.LastViewedAt,
                    ViewCount = item.ViewCount,
                    Source = item.Source
                })
                .ToList();

            return Ok(response);
        }

        [HttpGet("recommendations")]
        public async Task<IActionResult> GetRecommendations([FromQuery] int limit = 8)
        {
            var currentUserId = GetCurrentUserId();
            if (string.IsNullOrWhiteSpace(currentUserId))
            {
                return Unauthorized();
            }

            var normalizedLimit = Math.Clamp(limit, 1, 50);
            var cacheKey = $"recommendations:{currentUserId}:{normalizedLimit}";
            if (!_memoryCache.TryGetValue(cacheKey, out IReadOnlyList<RecommendationItem> recommendations))
            {
                recommendations = await _recommendationsService.GetRecommendationsAsync(currentUserId, normalizedLimit);
                _memoryCache.Set(cacheKey, recommendations, TimeSpan.FromMinutes(3));
            }

            _logger.LogInformation(
                "Recommendations requested for {UserId}. Returned {Count} items.",
                currentUserId,
                recommendations.Count);

            return Ok(recommendations);
        }

        [HttpGet("keys")]
        public async Task<IActionResult> GetKeys([FromQuery] int limit = 20)
        {
            var currentUserId = GetCurrentUserId();
            if (string.IsNullOrWhiteSpace(currentUserId))
            {
                return Unauthorized();
            }

            var normalizedLimit = Math.Clamp(limit, 1, 100);
            var keys = await _gameKeyRepository.GetByUserAsync(currentUserId, normalizedLimit);
            if (keys.Count == 0)
            {
                return Ok(Array.Empty<GameKeyResponse>());
            }

            var gameIds = keys.Select(item => item.GameId).Where(id => !string.IsNullOrWhiteSpace(id)).Distinct().ToList();
            var games = await _gameRepository.GetByIdsAsync(gameIds);
            var gameMap = games.Where(game => !string.IsNullOrWhiteSpace(game.Id))
                .ToDictionary(game => game.Id, game => game);

            var response = keys
                .Select(item => new GameKeyResponse
                {
                    Game = !string.IsNullOrWhiteSpace(item.GameId) && gameMap.TryGetValue(item.GameId, out var game)
                        ? game
                        : null,
                    Key = item.Key,
                    KeyType = item.KeyType,
                    IssuedAt = item.IssuedAt,
                    IsActive = item.IsActive
                })
                .ToList();

            return Ok(response);
        }

        private string GetCurrentUserId()
        {
            return User?.FindFirst("email")?.Value
                ?? User?.FindFirst(ClaimTypes.Email)?.Value
                ?? User?.FindFirst("preferred_username")?.Value
                ?? User?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? User?.FindFirst("sub")?.Value
                ?? string.Empty;
        }
    }

    public class ViewedGameRequest
    {
        public string Source { get; set; }
    }

    public class ViewedGameResponse
    {
        public Game Game { get; set; }
        public DateTime LastViewedAt { get; set; }
        public int ViewCount { get; set; }
        public string Source { get; set; }
    }

    public class GameKeyResponse
    {
        public Game Game { get; set; }
        public string Key { get; set; }
        public string KeyType { get; set; }
        public DateTime IssuedAt { get; set; }
        public bool IsActive { get; set; }
    }
}
