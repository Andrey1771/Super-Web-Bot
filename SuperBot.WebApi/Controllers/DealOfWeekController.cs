using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Services;
using SuperBot.WebApi.Services.Storefront;

namespace SuperBot.WebApi.Controllers
{
    /// <summary>
    /// Баннер «Deal of the week» на главной. Публичный GET отдаёт только id (героя и кулис) —
    /// витрина джойнит их с уже загруженным каталогом (как weekly-chart). Само предложение
    /// (процент/срок/цена) живёт в GameDiscount игры-героя и правится в админке скидок.
    /// </summary>
    [ApiController]
    public class DealOfWeekController : ControllerBase
    {
        /// <summary>Сколько обложек в «кулисах» баннера (по три с каждой стороны).</summary>
        public const int MaxWingGames = DealSpotlightService.MaxWingGames;

        /// <summary>Ключ кэша состава баннера; сам расчёт живёт в DealSpotlightService.</summary>
        public const string SpotlightCacheKey = DealSpotlightService.SpotlightCacheKey;

        private readonly IDealOfWeekSettingsRepository _settingsRepository;
        private readonly IGameRepository _gameRepository;
        private readonly IGameDiscountRepository _gameDiscountRepository;
        private readonly IMemoryCache _memoryCache;
        private readonly IDealSpotlightService _spotlight;

        public DealOfWeekController(
            IDealOfWeekSettingsRepository settingsRepository,
            IGameRepository gameRepository,
            IGameDiscountRepository gameDiscountRepository,
            IMemoryCache memoryCache,
            IDealSpotlightService spotlight)
        {
            _settingsRepository = settingsRepository;
            _gameRepository = gameRepository;
            _gameDiscountRepository = gameDiscountRepository;
            _memoryCache = memoryCache;
            _spotlight = spotlight;
        }

        [HttpGet("api/admin/deal-of-week")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> GetAdmin()
        {
            var config = await _settingsRepository.GetAsync();
            return Ok(await BuildAdminResponseAsync(config));
        }

        [HttpPut("api/admin/deal-of-week")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> Update([FromBody] UpdateDealOfWeekRequest request)
        {
            var games = await _gameRepository.GetAllAsync();
            var knownIds = games
                .Where(game => !string.IsNullOrWhiteSpace(game.Id))
                .Select(game => game.Id!)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            var heroGameId = string.IsNullOrWhiteSpace(request?.HeroGameId) ? null : request!.HeroGameId!.Trim();
            if (heroGameId != null && !knownIds.Contains(heroGameId))
            {
                return BadRequest(new { message = "Hero game not found." });
            }

            var wingGameIds = (request?.WingGameIds ?? new List<string>())
                .Where(id => !string.IsNullOrWhiteSpace(id) && knownIds.Contains(id))
                .Where(id => !string.Equals(id, heroGameId, StringComparison.OrdinalIgnoreCase))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(MaxWingGames)
                .ToList();

            var saved = await _settingsRepository.UpsertAsync(new DealOfWeekSettings
            {
                HeroGameId = heroGameId,
                WingGameIds = wingGameIds,
                UpdatedAt = DateTime.UtcNow
            });

            // Иначе админ сохранил бы новый состав и до двух минут видел на главной старый.
            _memoryCache.Remove(SpotlightCacheKey);

            return Ok(await BuildAdminResponseAsync(saved));
        }

        /// <summary>Конфиг + статус предложения героя — админка предупреждает, если скидки нет.</summary>
        private async Task<object> BuildAdminResponseAsync(DealOfWeekSettings? config)
        {
            var heroDealActive = false;
            DateTime? heroDealEndsAt = null;
            decimal? heroDealPercent = null;

            if (!string.IsNullOrWhiteSpace(config?.HeroGameId))
            {
                var discount = await _gameDiscountRepository.GetByGameIdAsync(config!.HeroGameId!);
                if (discount != null && discount.IsActiveAt(DateTime.UtcNow) && discount.DiscountPercent > 0)
                {
                    heroDealActive = true;
                    heroDealEndsAt = discount.EndDate;
                    heroDealPercent = discount.DiscountPercent;
                }
            }

            // Названия выбранных игр отдаём вместе с идентификаторами. Без них админка не могла
            // бы показать, что именно выбрано, не выкачав каталог: искать название по id в
            // списке «первых двухсот» получается ровно до тех пор, пока игр меньше двухсот.
            var wingIds = config?.WingGameIds ?? new List<string>();
            var needed = wingIds.ToList();
            if (!string.IsNullOrWhiteSpace(config?.HeroGameId))
            {
                needed.Add(config!.HeroGameId!);
            }

            var titles = needed.Count == 0
                ? new Dictionary<string, string>()
                : (await _gameRepository.GetByIdsAsync(needed))
                    .Where(game => !string.IsNullOrWhiteSpace(game.Id))
                    .ToDictionary(
                        game => game.Id!,
                        game => string.IsNullOrWhiteSpace(game.Title) ? game.Name ?? game.Id! : game.Title,
                        StringComparer.OrdinalIgnoreCase);

            return new
            {
                heroGameId = config?.HeroGameId,
                heroTitle = config?.HeroGameId != null && titles.TryGetValue(config.HeroGameId, out var heroName) ? heroName : null,
                wingGameIds = wingIds,
                // Игра могла быть удалена из каталога после того, как её выбрали, — тогда
                // названия нет, и лучше показать это прямо, чем прятать строку.
                wings = wingIds.Select(id => new { gameId = id, title = titles.TryGetValue(id, out var name) ? name : null }).ToList(),
                maxWingGames = MaxWingGames,
                heroDealActive,
                heroDealEndsAt,
                heroDealPercent
            };
        }
    }

    public class UpdateDealOfWeekRequest
    {
        public string? HeroGameId { get; set; }
        public List<string>? WingGameIds { get; set; }
    }
}
