using AutoMapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Services;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class GameController : ControllerBase
    {
        /// <summary>Окно «недельного чарта» продаж на витрине.</summary>
        private const int WeeklyChartWindowDays = 7;
        /// <summary>Потолок выдачи чарта — защита от запроса «отдай весь каталог одним списком».</summary>
        private const int WeeklyChartMaxLimit = 24;
        /// <summary>Столько игр просит витрина по умолчанию: полка — 4 колонки × 2 ряда.</summary>
        private const int WeeklyChartDefaultLimit = 8;
        /// <summary>Заказ дораспределённых версий: одна позиция без списка Items = одна проданная копия.</summary>
        private const int LegacyOrderSoldQuantity = 1;
        /// <summary>
        /// Чарт одинаков для всех посетителей, поэтому кэш общий (ключ без пользователя):
        /// первый зашедший считает, остальные получают готовое. Топ продаж не обязан быть
        /// точным до секунды — 10 минут «свежести» дешевле, чем расчёт на каждое открытие главной.
        /// </summary>
        public const string WeeklyChartCacheKey = "game:weekly-chart";
        private static readonly TimeSpan WeeklyChartCacheTtl = TimeSpan.FromMinutes(10);

        private readonly IGameRepository _gameRepository;
        private readonly IGameDiscountRepository _gameDiscountRepository;
        private readonly IGameDetailsRepository _gameDetailsRepository;
        private readonly IMediaAssetRepository _mediaRepository;
        private readonly IOrderRepository _orderRepository;
        private readonly IMemoryCache _memoryCache;
        private readonly IMapper _mapper;

        public GameController(
            IGameRepository gameRepository,
            IGameDiscountRepository gameDiscountRepository,
            IGameDetailsRepository gameDetailsRepository,
            IMediaAssetRepository mediaRepository,
            IOrderRepository orderRepository,
            IMemoryCache memoryCache,
            IMapper mapper)
        {
            _gameRepository = gameRepository;
            _gameDiscountRepository = gameDiscountRepository;
            _gameDetailsRepository = gameDetailsRepository;
            _mediaRepository = mediaRepository;
            _orderRepository = orderRepository;
            _memoryCache = memoryCache;
            _mapper = mapper;
        }

        /// <summary>
        /// Топ продаж за последнюю неделю для полки «Popular this week»:
        /// [{ gameId, sold }] по оплаченным заказам, отсортировано по количеству.
        /// Витрина сама джойнит с каталогом — здесь только агрегат.
        /// </summary>
        [HttpGet("weekly-chart")]
        public async Task<IActionResult> GetWeeklyChart([FromQuery] int limit = WeeklyChartDefaultLimit)
        {
            limit = Math.Clamp(limit, 1, WeeklyChartMaxLimit);

            // Кэшируем ПОЛНЫЙ чарт (до максимума), а limit применяем уже к готовому списку —
            // иначе на каждый limit заводился бы свой кэш и своя загрузка заказов.
            var chart = await _memoryCache.GetOrCreateAsync(WeeklyChartCacheKey, async entry =>
            {
                entry.AbsoluteExpirationRelativeToNow = WeeklyChartCacheTtl;
                return await BuildWeeklyChartAsync();
            }) ?? new List<WeeklyChartEntry>();

            return Ok(chart.Take(limit));
        }

        /// <summary>Считает топ продаж за неделю. Дорогая операция — зовётся только при промахе кэша.</summary>
        private async Task<List<WeeklyChartEntry>> BuildWeeklyChartAsync()
        {
            var since = DateTime.UtcNow.AddDays(-WeeklyChartWindowDays);
            // Отбор идёт в базе: раньше здесь читалась вся коллекция заказов и фильтровалась в памяти.
            var orders = await _orderRepository.GetPaidOrdersSinceAsync(since);

            var soldByGameId = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            void AddSold(string? gameId, int quantity)
            {
                if (string.IsNullOrWhiteSpace(gameId) || quantity <= 0)
                {
                    return;
                }
                soldByGameId[gameId] = soldByGameId.TryGetValue(gameId, out var current) ? current + quantity : quantity;
            }

            foreach (var order in orders)
            {
                var hasItemLines = order.Items != null && order.Items.Count > 0;
                if (hasItemLines)
                {
                    foreach (var item in order.Items!)
                    {
                        AddSold(item.GameId, item.Quantity);
                    }
                }
                else
                {
                    // Заказ ранних версий: списка позиций нет, покупка описана полями самого заказа.
                    AddSold(order.GameId, LegacyOrderSoldQuantity);
                }
            }

            return soldByGameId
                .OrderByDescending(entry => entry.Value)
                .Take(WeeklyChartMaxLimit)
                .Select(entry => new WeeklyChartEntry(entry.Key, entry.Value))
                .ToList();
        }

        /// <summary>Строка чарта продаж. Именованный тип, а не анонимный: значение кладётся в кэш.</summary>
        public sealed record WeeklyChartEntry(string GameId, int Sold);

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
                // Статус релиза считает сервер (клиентским часам доверять нельзя), а скидка
                // на невышедшую игру гасится: продать её всё равно нельзя — прайсинг откажет.
                var isComingSoon = GameRelease.IsUpcoming(game.ReleaseDate, utcNow);
                var discountActive = !isComingSoon && discount is not null && discount.IsActiveAt(utcNow);
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
                    isComingSoon,
                    price = game.Price,
                    finalPrice,
                    discountPercent,
                    discountActive,
                    // Когда скидка закончится (UTC) — витрина рисует обратный отсчёт «deal ends in…».
                    discountEndsAt = discountActive ? discount!.EndDate : (DateTime?)null,
                    genres = genres.Length > 0 ? genres : new[] { GameTypeMapper.DescriptionsCategories[game.GameType] },
                    platforms = BuildPlatformLabels(details?.Platforms),
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
            // Та же логика, что в списке: релиз-статус от сервера, скидка на невышедшую гасится.
            var isComingSoon = GameRelease.IsUpcoming(game.ReleaseDate, DateTime.UtcNow);
            var discountActive = !isComingSoon && discount is not null && discount.IsActiveAt(DateTime.UtcNow);
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
                isComingSoon,
                price = game.Price,
                finalPrice,
                discountPercent,
                discountActive,
                genres = genres.Length > 0 ? genres : new[] { GameTypeMapper.DescriptionsCategories[game.GameType] },
                platforms = BuildPlatformLabels(details?.Platforms),
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

        /// <summary>
        /// Ярлыки платформ для витрины (иконки на карточках, фильтр каталога ?platforms=).
        /// Магазин исторически PC-first: пока платформы у игры не заполнены — считаем её PC-игрой,
        /// чтобы карточки не оставались без иконки.
        /// </summary>
        private static string[] BuildPlatformLabels(GamePlatforms? platforms)
        {
            var labels = new List<string>();
            if (platforms?.Windows == true) labels.Add("PC");
            if (platforms?.Mac == true) labels.Add("Mac");
            if (platforms?.Linux == true) labels.Add("Linux");
            if (platforms?.PlayStation == true) labels.Add("PlayStation");
            if (platforms?.Xbox == true) labels.Add("Xbox");
            return labels.Count > 0 ? labels.ToArray() : new[] { "PC" };
        }
    }
}
