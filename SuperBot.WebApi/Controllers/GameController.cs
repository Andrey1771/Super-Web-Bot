using AutoMapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class GameController : ControllerBase
    {
        private readonly IGameRepository _gameRepository;
        private readonly IGameDiscountRepository _gameDiscountRepository;
        private readonly IGameDetailsRepository _gameDetailsRepository;
        private readonly IMediaAssetRepository _mediaRepository;
        private readonly IMapper _mapper;

        public GameController(
            IGameRepository gameRepository,
            IGameDiscountRepository gameDiscountRepository,
            IGameDetailsRepository gameDetailsRepository,
            IMediaAssetRepository mediaRepository,
            IMapper mapper)
        {
            _gameRepository = gameRepository;
            _gameDiscountRepository = gameDiscountRepository;
            _gameDetailsRepository = gameDetailsRepository;
            _mediaRepository = mediaRepository;
            _mapper = mapper;
        }

        [HttpGet]
        public async Task<IActionResult> GetAllGames()
        {
            var games = await _gameRepository.GetAllAsync();
            var discounts = await _gameDiscountRepository.GetByGameIdsAsync(games.Select(game => game.Id));
            var gameDetails = await _gameDetailsRepository.GetByGameIdsAsync(games.Select(game => game.Id));
            var coverMediaIds = games
                .Where(game => string.IsNullOrWhiteSpace(game.ImagePath) && !string.IsNullOrWhiteSpace(game.CoverMediaId))
                .Select(game => game.CoverMediaId)
                .Distinct()
                .ToArray();
            var coverUrlByMediaId = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var coverMediaId in coverMediaIds)
            {
                try
                {
                    var media = await _mediaRepository.GetByIdAsync(coverMediaId);
                    if (!string.IsNullOrWhiteSpace(media?.Url))
                    {
                        coverUrlByMediaId[coverMediaId] = media.Url;
                    }
                }
                catch
                {
                    // Ignore media lookup errors and keep existing game imagePath.
                }
            }
            var discountByGameId = discounts.ToDictionary(discount => discount.GameId, discount => discount);
            var detailsByGameId = gameDetails
                .Where(details => !string.IsNullOrWhiteSpace(details.GameId))
                .ToDictionary(details => details.GameId!, details => details);
            var utcNow = DateTime.UtcNow;

            var result = games.Select(game =>
            {
                discountByGameId.TryGetValue(game.Id, out var discount);
                detailsByGameId.TryGetValue(game.Id, out var details);
                var discountActive = discount is not null && discount.IsActiveAt(utcNow);
                var discountPercent = discountActive ? discount!.DiscountPercent : (decimal?)null;
                var finalPrice = CalculateFinalPrice(game.Price, discountPercent);
                var genres = details?.Genres?.Where(item => !string.IsNullOrWhiteSpace(item)).ToArray()
                    ?? Array.Empty<string>();
                var resolvedImagePath = game.ImagePath;
                if (string.IsNullOrWhiteSpace(resolvedImagePath) &&
                    !string.IsNullOrWhiteSpace(game.CoverMediaId) &&
                    coverUrlByMediaId.TryGetValue(game.CoverMediaId, out var mediaUrl))
                {
                    resolvedImagePath = mediaUrl;
                }

                return new
                {
                    id = game.Id,
                    slug = game.Slug,
                    name = game.Name,
                    description = game.Description,
                    title = game.Title,
                    gameType = game.GameType,
                    imagePath = resolvedImagePath,
                    coverMediaId = game.CoverMediaId,
                    releaseDate = game.ReleaseDate,
                    price = game.Price,
                    finalPrice,
                    discountPercent,
                    discountActive,
                    genres = genres.Length > 0 ? genres : new[] { GameTypeMapper.DescriptionsCategories[game.GameType] },
                    platforms = BuildPlatforms(details),
                    ratingAvg = details?.RatingAvg ?? 0,
                    reviewsCount = details?.ReviewsCount ?? 0,
                    showInFeaturedStorefront = details?.ShowInFeaturedStorefront ?? false,
                    featuredStorefrontPriority = details?.FeaturedStorefrontPriority ?? int.MaxValue
                };
            });

            return Ok(result);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetGameById(string id)
        {
            var game = await _gameRepository.GetByIdAsync(id);
            if (game == null)
            {
                return NotFound();
            }

            var discount = await _gameDiscountRepository.GetByGameIdAsync(id);
            var details = await _gameDetailsRepository.GetByGameIdAsync(id);
            var discountActive = discount is not null && discount.IsActiveAt(DateTime.UtcNow);
            var discountPercent = discountActive ? discount!.DiscountPercent : (decimal?)null;
            var finalPrice = CalculateFinalPrice(game.Price, discountPercent);
            var genres = details?.Genres?.Where(item => !string.IsNullOrWhiteSpace(item)).ToArray()
                ?? Array.Empty<string>();
            var resolvedImagePath = game.ImagePath;
            if (string.IsNullOrWhiteSpace(resolvedImagePath) && !string.IsNullOrWhiteSpace(game.CoverMediaId))
            {
                try
                {
                    var media = await _mediaRepository.GetByIdAsync(game.CoverMediaId);
                    if (!string.IsNullOrWhiteSpace(media?.Url))
                    {
                        resolvedImagePath = media.Url;
                    }
                }
                catch
                {
                    // Ignore media lookup errors and keep existing game imagePath.
                }
            }

            return Ok(new
            {
                id = game.Id,
                slug = game.Slug,
                name = game.Name,
                description = game.Description,
                title = game.Title,
                gameType = game.GameType,
                imagePath = resolvedImagePath,
                coverMediaId = game.CoverMediaId,
                releaseDate = game.ReleaseDate,
                price = game.Price,
                finalPrice,
                discountPercent,
                discountActive,
                genres = genres.Length > 0 ? genres : new[] { GameTypeMapper.DescriptionsCategories[game.GameType] },
                platforms = BuildPlatforms(details),
                ratingAvg = details?.RatingAvg ?? 0,
                reviewsCount = details?.ReviewsCount ?? 0,
                showInFeaturedStorefront = details?.ShowInFeaturedStorefront ?? false,
                featuredStorefrontPriority = details?.FeaturedStorefrontPriority ?? int.MaxValue
            });
        }

        [HttpPost]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> CreateGame([FromBody] Game newGame)
        {
            var game = _mapper.Map<Game>(newGame);
            await _gameRepository.CreateAsync(game);
            return CreatedAtAction(nameof(GetGameById), new { id = Guid.NewGuid() }, game);
        }

        [HttpPut("{id}")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> UpdateGame(string id, [FromBody] Game updatedGame)
        {
            var game = await _gameRepository.GetByIdAsync(id);
            if (game == null)
            {
                return NotFound();
            }

            var updatedGameForDb = _mapper.Map<Game>(updatedGame);
            await _gameRepository.UpdateAsync(id, updatedGameForDb);
            return NoContent();
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> DeleteGame(string id)
        {
            var game = await _gameRepository.GetByIdAsync(id);
            if (game == null)
            {
                return NotFound();
            }

            await _gameRepository.DeleteAsync(id);
            await _gameDiscountRepository.DeleteByGameIdAsync(id);
            return NoContent();
        }

        private static decimal CalculateFinalPrice(decimal price, decimal? discountPercent) =>
            SuperBot.Core.Services.PriceCalculator.FinalPrice(price, discountPercent);

        // Платформы для карточки/фильтра каталога — из GameDetails.Platforms (флаги ОС) в человекочитаемые метки.
        private static string[] BuildPlatforms(GameDetails? details)
        {
            if (details?.Platforms is null)
            {
                return Array.Empty<string>();
            }

            var platforms = new List<string>(3);
            if (details.Platforms.Windows) platforms.Add("Windows");
            if (details.Platforms.Mac) platforms.Add("macOS");
            if (details.Platforms.Linux) platforms.Add("Linux");
            return platforms.ToArray();
        }
    }
}
