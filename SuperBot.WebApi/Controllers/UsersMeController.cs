using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using System;
using System.Security.Claims;
using SuperBot.Common.Auth;

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
        private readonly SuperBot.Core.Payments.StorefrontCurrencyOptions _currencies;
        private readonly SuperBot.Infrastructure.Services.IFxRateService _fxRates;
        private readonly SuperBot.Core.Payments.FxOptions _fx;

        public UsersMeController(
            IViewedGameRepository viewedGameRepository,
            IGameKeyRepository gameKeyRepository,
            IGameRepository gameRepository,
            IRecommendationsService recommendationsService,
            IMemoryCache memoryCache,
            ILogger<UsersMeController> logger,
            Microsoft.Extensions.Options.IOptions<SuperBot.Core.Payments.StorefrontCurrencyOptions> currencies,
            SuperBot.Infrastructure.Services.IFxRateService fxRates,
            Microsoft.Extensions.Options.IOptionsSnapshot<SuperBot.Core.Payments.FxOptions> fx)
        {
            _viewedGameRepository = viewedGameRepository;
            _gameKeyRepository = gameKeyRepository;
            _gameRepository = gameRepository;
            _recommendationsService = recommendationsService;
            _memoryCache = memoryCache;
            _logger = logger;
            _currencies = currencies.Value;
            _fxRates = fxRates;
            _fx = fx.Value;
        }

        [HttpPost("viewed/{gameId}")]
        public async Task<IActionResult> AddViewedGame(string gameId, [FromBody] ViewedGameRequest request = null)
        {
            if (string.IsNullOrWhiteSpace(gameId))
            {
                return BadRequest("GameId is required.");
            }

            var currentUserId = User.GetUserKey();
            if (string.IsNullOrWhiteSpace(currentUserId))
            {
                return Unauthorized();
            }

            await _viewedGameRepository.UpsertAsync(currentUserId, gameId, request?.Source);
            return Ok();
        }

        [HttpGet("viewed")]
        public async Task<IActionResult> GetViewedGames([FromServices] IGameDetailsRepository gameDetails, [FromQuery] int limit = 12, [FromQuery] string? currency = null)
        {
            var currentUserId = User.GetUserKey();
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

            // Черновик снят с витрины — в истории его тоже нет: карточка по ссылке отвечает 404.
            var drafts = (await gameDetails.GetByGameIdsAsync(games.Select(game => game.Id!).Where(id => !string.IsNullOrWhiteSpace(id))))
                .Where(details => details.IsDraft && !string.IsNullOrWhiteSpace(details.GameId))
                .Select(details => details.GameId!)
                .ToHashSet(StringComparer.Ordinal);
            var gameMap = games.Where(game => !string.IsNullOrWhiteSpace(game.Id) && !drafts.Contains(game.Id))
                .ToDictionary(game => game.Id!, game => game);

            // Цена — в валюте покупателя, как у рекомендаций: раньше лента отдавала базовую сумму,
            // а витрина рисовала её со значком выбранной валюты.
            var resolvedCurrency = _currencies.Resolve(currency);
            var rates = _fxRates.Current();
            var trailers = await SuperBot.Core.Catalog.CatalogTrailer.ForGamesAsync(gameDetails, gameMap.Keys);

            var response = viewedGames
                .Where(item => gameMap.ContainsKey(item.GameId))
                .Select(item => new ViewedGameResponse
                {
                    Game = ToPricedGame(gameMap[item.GameId], resolvedCurrency, rates,
                        trailers.TryGetValue(item.GameId, out var trailer) ? trailer : default),
                    LastViewedAt = item.LastViewedAt,
                    ViewCount = item.ViewCount,
                    Source = item.Source
                })
                .ToList();

            return Ok(response);
        }

        // Гостям тоже показываем рекомендации (страницы корзины/каталога публичные):
        // без личной истории сервис отдаёт «трендовый» фолбэк.
        [AllowAnonymous]
        [HttpGet("recommendations")]
        public async Task<IActionResult> GetRecommendations([FromServices] IGameDetailsRepository gameDetails, [FromQuery] int limit = 8, [FromQuery] string? currency = null)
        {
            var currentUserId = User.GetUserKey();
            if (string.IsNullOrWhiteSpace(currentUserId))
            {
                currentUserId = string.Empty; // guest — сервис уйдёт в fallback-подборку
            }

            var normalizedLimit = Math.Clamp(limit, 1, 50);
            // Валюта — часть ключа кэша: подборка одна и та же, а цены в ней разные, и без этого
            // первый зашедший «застолбил» бы свою валюту для всех на три минуты.
            var resolvedCurrency = _currencies.Resolve(currency);
            var cacheKey = $"recommendations:{(string.IsNullOrEmpty(currentUserId) ? "guest" : currentUserId)}:{normalizedLimit}:{resolvedCurrency}";
            if (!_memoryCache.TryGetValue(cacheKey, out IReadOnlyList<RecommendationItem> recommendations))
            {
                recommendations = await _recommendationsService.GetRecommendationsAsync(currentUserId, normalizedLimit);
                // Пустой результат НЕ кэшируем: транзиентная пустота (рестарт бэкенда / хиккап БД, когда каталог
                // ещё не подтянулся) иначе «застряла» бы в кэше на 3 минуты. Кэшируем только непустое.
                if (recommendations.Count > 0)
                {
                    _memoryCache.Set(cacheKey, recommendations, TimeSpan.FromMinutes(3));
                }
            }

            _logger.LogInformation(
                "Recommendations requested for {UserId}. Returned {Count} items.",
                currentUserId,
                recommendations.Count);

            // Цена приводится к валюте покупателя тем же способом, что в каталоге: сначала
            // ручной прайс-лист, потом пересчёт по курсу. Иначе витрина показывала бы базовую
            // сумму со значком выбранной валюты — цену, которой не существует.
            var rates = _fxRates.Current();
            // Трейлеры — для превью при наведении на карточку рекомендации, тем же правилом, что в каталоге.
            var trailers = await SuperBot.Core.Catalog.CatalogTrailer.ForGamesAsync(gameDetails, recommendations.Select(item => item.Game?.Id));
            var response = recommendations.Select(item => new
            {
                reason = item.Reason,
                game = ToPricedGame(item.Game, resolvedCurrency, rates,
                    item.Game?.Id != null && trailers.TryGetValue(item.Game.Id, out var trailer) ? trailer : default)
            });

            return Ok(response);
        }

        /// <summary>
        /// Игра с ценой в валюте покупателя. Возвращается новый объект, а не правится исходный:
        /// список лежит в кэше, и правка на месте испортила бы его для всех остальных валют.
        /// </summary>
        private object ToPricedGame(SuperBot.Core.Entities.Game game, string currency, SuperBot.Core.Payments.FxRateBook rates,
            (string? Url, string? Poster) trailer = default)
        {
            var price = SuperBot.Core.Payments.GamePricing.TryGetPrice(game, currency, rates, _fx);
            return new
            {
                id = game.Id,
                gameId = game.Id,
                slug = game.Slug,
                name = game.Name,
                title = game.Title,
                description = game.Description,
                imagePath = game.ImagePath,
                trailerUrl = trailer.Url,
                trailerPosterUrl = trailer.Poster,
                gameType = game.GameType,
                genre = game.Kind == ProductKind.Software ? null : GameGenres.TagOf(game),
                releaseDate = game.ReleaseDate,
                // Предзаказа нет: до выхода кнопку «В корзину» карточка показывает неактивной.
                isComingSoon = SuperBot.Core.Services.GameRelease.IsUpcoming(game.ReleaseDate, DateTime.UtcNow),
                // Цены нет в этой валюте — отдаём null, а не базовую сумму: витрина покажет
                // «цена недоступна», и это честнее подставленной чужой валюты.
                price,
                finalPrice = price,
                currency = price is null ? null : currency
            };
        }

        [HttpGet("keys")]
        public async Task<IActionResult> GetKeys([FromServices] IGameDetailsRepository gameDetails, [FromQuery] int limit = 20)
        {
            var currentUserId = User.GetUserKey();
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

            // Только валидные ObjectId: ключ с битым/устаревшим gameId (удалённая игра) не должен ронять всю страницу.
            var gameIds = keys.Select(item => item.GameId)
                .Where(id => !string.IsNullOrWhiteSpace(id) && System.Text.RegularExpressions.Regex.IsMatch(id, "^[0-9a-fA-F]{24}$"))
                .Distinct().ToList();
            var games = await _gameRepository.GetByIdsAsync(gameIds);
            var gameMap = games.Where(game => !string.IsNullOrWhiteSpace(game.Id))
                .ToDictionary(game => game.Id, game => game);

            // У ключей ПО кабинет показывает лицензию и место активации — они в карточке товара.
            var softwareIds = games.Where(game => game.Kind == ProductKind.Software && !string.IsNullOrWhiteSpace(game.Id)).Select(game => game.Id!).ToList();
            var detailsByGameId = softwareIds.Count == 0
                ? new Dictionary<string, GameDetails>()
                : (await gameDetails.GetByGameIdsAsync(softwareIds))
                    .Where(details => !string.IsNullOrWhiteSpace(details.GameId))
                    .GroupBy(details => details.GameId!)
                    .ToDictionary(group => group.Key, group => group.First());

            var response = keys
                .Select(item =>
                {
                    var game = !string.IsNullOrWhiteSpace(item.GameId) && gameMap.TryGetValue(item.GameId, out var found) ? found : null;
                    var software = game?.Kind == ProductKind.Software;
                    GameDetails? details = null;
                    if (software)
                    {
                        detailsByGameId.TryGetValue(game!.Id!, out details);
                    }
                    // Ключ без кода издания — ключ издания по умолчанию, как и при выдаче.
                    var edition = GameEditions.Resolve(details?.Editions, item.EditionCode);
                    return new GameKeyResponse
                    {
                        Game = game,
                        Key = item.Key,
                        KeyType = item.KeyType,
                        IssuedAt = item.IssuedAt,
                        IsActive = item.IsActive,
                        Kind = (game?.Kind ?? ProductKind.Game).ToString(),
                        License = software ? SoftwareCatalog.LicenseLabel(edition) ?? edition?.Title : null,
                        LicenseTermMonths = software ? edition?.LicenseTermMonths : null,
                        LicenseDevices = software ? edition?.LicenseDevices : null,
                        LicenseIsSubscription = software && edition?.IsSubscription == true,
                        Activation = software && details?.Activation is { } activation
                            ? new KeyActivationResponse(activation.Target.ToString(), activation.Url, activation.Label)
                            : null
                    };
                })
                .ToList();

            return Ok(response);
        }

    }

    public class ViewedGameRequest
    {
        public string Source { get; set; }
    }

    public class ViewedGameResponse
    {
        /// <summary>Игра с ценой в валюте покупателя (см. ToPricedGame).</summary>
        public object Game { get; set; }
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
        /// <summary>Game или Software — строкой: в объекте Game перечисление уходит числом.</summary>
        public string Kind { get; set; } = nameof(ProductKind.Game);
        /// <summary>Лицензия ПО («1 year · 3 devices»). У игр null. Английский запас: кабинет собирает подпись сам.</summary>
        public string? License { get; set; }
        /// <summary>Срок лицензии ПО в месяцах; null — бессрочная (или у игры).</summary>
        public int? LicenseTermMonths { get; set; }
        /// <summary>Число устройств лицензии ПО; null — не задано.</summary>
        public int? LicenseDevices { get; set; }
        public bool LicenseIsSubscription { get; set; }
        /// <summary>Где активировать ключ ПО. У игр null — там площадка в KeyType.</summary>
        public KeyActivationResponse? Activation { get; set; }
    }

    public sealed record KeyActivationResponse(string Target, string? Url, string? Label);
}
