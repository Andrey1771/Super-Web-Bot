using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Services;

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
        public const int MaxWingGames = 6;

        /// <summary>
        /// Состав баннера одинаков для всех посетителей, поэтому кэш общий (ключ без пользователя).
        /// TTL короткий: правку в админке админ ожидает увидеть почти сразу, а не через 10 минут.
        /// При сохранении настроек кэш сбрасывается явно — см. Update.
        /// </summary>
        public const string SpotlightCacheKey = "deal-of-week:spotlight";
        private static readonly TimeSpan SpotlightCacheTtl = TimeSpan.FromMinutes(2);

        private readonly IDealOfWeekSettingsRepository _settingsRepository;
        private readonly IGameRepository _gameRepository;
        private readonly IGameDiscountRepository _gameDiscountRepository;
        private readonly IMemoryCache _memoryCache;

        public DealOfWeekController(
            IDealOfWeekSettingsRepository settingsRepository,
            IGameRepository gameRepository,
            IGameDiscountRepository gameDiscountRepository,
            IMemoryCache memoryCache)
        {
            _settingsRepository = settingsRepository;
            _gameRepository = gameRepository;
            _gameDiscountRepository = gameDiscountRepository;
            _memoryCache = memoryCache;
        }

        [HttpGet("api/deal-of-week")]
        public async Task<IActionResult> GetPublic()
        {
            var spotlight = await _memoryCache.GetOrCreateAsync(SpotlightCacheKey, async entry =>
            {
                entry.AbsoluteExpirationRelativeToNow = SpotlightCacheTtl;
                var resolved = await ResolveAsync();
                return new DealSpotlight(resolved.HeroGameId, resolved.WingGameIds);
            }) ?? new DealSpotlight(null, new List<string>());

            return Ok(new { heroGameId = spotlight.HeroGameId, wingGameIds = spotlight.WingGameIds });
        }

        /// <summary>Состав баннера для витрины. Именованный тип, а не анонимный: кладётся в кэш.</summary>
        private sealed record DealSpotlight(string? HeroGameId, List<string> WingGameIds);

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

        /// <summary>
        /// Итоговые id для витрины. Конфиг может «протухнуть» (скидка героя кончилась, игры
        /// удалены) — тогда включаются фолбэки: герой = самая глубокая живая скидка,
        /// кулисы = самые свежие вышедшие игры. Баннер не умирает от забытой настройки.
        /// </summary>
        private async Task<(string? HeroGameId, List<string> WingGameIds)> ResolveAsync()
        {
            var config = await _settingsRepository.GetAsync();
            var games = await _gameRepository.GetAllAsync();
            var utcNow = DateTime.UtcNow;

            var gameById = games
                .Where(game => !string.IsNullOrWhiteSpace(game.Id))
                .ToDictionary(game => game.Id!, StringComparer.OrdinalIgnoreCase);
            var discounts = await _gameDiscountRepository.GetByGameIdsAsync(gameById.Keys);
            var discountByGameId = discounts
                .Where(discount => !string.IsNullOrWhiteSpace(discount.GameId))
                .ToDictionary(discount => discount.GameId!, discount => discount, StringComparer.OrdinalIgnoreCase);

            bool hasLiveDeal(string gameId) =>
                gameById.TryGetValue(gameId, out var game) &&
                !GameRelease.IsUpcoming(game.ReleaseDate, utcNow) &&
                discountByGameId.TryGetValue(gameId, out var discount) &&
                discount.IsActiveAt(utcNow) &&
                discount.DiscountPercent > 0;

            var heroGameId = config?.HeroGameId != null && hasLiveDeal(config.HeroGameId)
                ? gameById[config.HeroGameId].Id
                : gameById.Keys
                    .Where(hasLiveDeal)
                    .OrderByDescending(id => discountByGameId[id].DiscountPercent)
                    .FirstOrDefault();

            var wingGameIds = (config?.WingGameIds ?? new List<string>())
                .Where(id => gameById.ContainsKey(id))
                .Where(id => !string.Equals(id, heroGameId, StringComparison.OrdinalIgnoreCase))
                .Select(id => gameById[id].Id!)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(MaxWingGames)
                .ToList();

            if (wingGameIds.Count == 0)
            {
                wingGameIds = games
                    .Where(game => !string.IsNullOrWhiteSpace(game.Id))
                    .Where(game => !GameRelease.IsUpcoming(game.ReleaseDate, utcNow))
                    .Where(game => !string.Equals(game.Id, heroGameId, StringComparison.OrdinalIgnoreCase))
                    .OrderByDescending(game => game.ReleaseDate)
                    .Take(MaxWingGames)
                    .Select(game => game.Id!)
                    .ToList();
            }

            return (heroGameId, wingGameIds);
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

            return new
            {
                heroGameId = config?.HeroGameId,
                wingGameIds = config?.WingGameIds ?? new List<string>(),
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
