using AutoMapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Services;
using SuperBot.WebApi.Services;

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

        /// <summary>
        /// Начиная с этого остатка витрина торопит покупателя («Only 3 left»). Точный размер запаса
        /// наружу не отдаём: это коммерческая информация, конкуренту знать её незачем.
        /// </summary>
        public const int LowStockThreshold = CatalogSnapshotService.LowStockThreshold;

        private readonly IGameRepository _gameRepository;
        private readonly IGameDiscountRepository _gameDiscountRepository;
        private readonly IGameDetailsRepository _gameDetailsRepository;
        private readonly IMediaAssetRepository _mediaRepository;
        private readonly IOrderRepository _orderRepository;
        private readonly ICatalogSnapshotService _catalogSnapshot;
        private readonly IMemoryCache _memoryCache;
        private readonly IMapper _mapper;
        private readonly SuperBot.Core.Payments.StorefrontCurrencyOptions _currencies;
        private readonly SuperBot.Infrastructure.Services.IFxRateService _fxRates;
        private readonly SuperBot.Core.Payments.FxOptions _fx;

        public GameController(
            IGameRepository gameRepository,
            IGameDiscountRepository gameDiscountRepository,
            IGameDetailsRepository gameDetailsRepository,
            IMediaAssetRepository mediaRepository,
            IOrderRepository orderRepository,
            ICatalogSnapshotService catalogSnapshot,
            IMemoryCache memoryCache,
            IMapper mapper,
            Microsoft.Extensions.Options.IOptions<SuperBot.Core.Payments.StorefrontCurrencyOptions> currencies,
            SuperBot.Infrastructure.Services.IFxRateService fxRates,
            Microsoft.Extensions.Options.IOptions<SuperBot.Core.Payments.FxOptions> fx)
        {
            _currencies = currencies.Value;
            _fxRates = fxRates;
            _fx = fx.Value;
            _gameRepository = gameRepository;
            _gameDiscountRepository = gameDiscountRepository;
            _gameDetailsRepository = gameDetailsRepository;
            _mediaRepository = mediaRepository;
            _orderRepository = orderRepository;
            _catalogSnapshot = catalogSnapshot;
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
            var chart = await GetWeeklyChartAsync();

            return Ok(chart.Take(limit));
        }

        /// <summary>
        /// Готовый чарт продаж. Кэшируем его ПОЛНЫМ (до максимума), а limit применяется уже
        /// к готовому списку — иначе на каждый limit заводился бы свой кэш и своя загрузка заказов.
        /// Тем же чартом задаётся порядок «Most Popular» в каталоге.
        /// </summary>
        private async Task<List<WeeklyChartEntry>> GetWeeklyChartAsync() =>
            await _memoryCache.GetOrCreateAsync(WeeklyChartCacheKey, async entry =>
            {
                entry.AbsoluteExpirationRelativeToNow = WeeklyChartCacheTtl;
                return await BuildWeeklyChartAsync();
            }) ?? new List<WeeklyChartEntry>();

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

        /// <summary>
        /// Весь каталог одним списком — этим живут полки главной страницы, которым нужен
        /// сразу весь набор. Сетка каталога ходит в постраничный <see cref="GetCatalog"/>.
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> GetAllGames([FromQuery] string? currency = null)
        {
            var catalog = await GetCatalogInCurrencyAsync(currency);
            return Ok(catalog.Select(ToCardDto));
        }

        /// <summary>
        /// Каталог, приведённый к валюте покупателя. Валюту берём только из списка витрины:
        /// произвольный ?currency= в адресе не должен показывать цены в валюте, в которой их
        /// никто не назначал.
        /// </summary>
        private async Task<IReadOnlyList<CatalogItem>> GetCatalogInCurrencyAsync(string? requested)
        {
            var catalog = await _catalogSnapshot.GetAsync();
            return CatalogPricing.InCurrency(catalog, _currencies.Resolve(requested), _fxRates.Current(), _fx);
        }

        /// <summary>
        /// Страница каталога: отбор, поиск, порядок и счётчики фильтров считает сервер.
        /// Витрина получает ровно то, что показывает, а не весь каталог целиком.
        /// </summary>
        [HttpGet("catalog")]
        public async Task<IActionResult> GetCatalog(
            [FromQuery] string q = "",
            [FromQuery] string categories = "",
            [FromQuery] string categoryQuery = "",
            [FromQuery] string categorySlug = "",
            [FromQuery] string platforms = "",
            [FromQuery] decimal? minPrice = null,
            [FromQuery] decimal? maxPrice = null,
            [FromQuery] bool onSale = false,
            [FromQuery] bool inStock = false,
            [FromQuery] bool comingSoon = false,
            [FromQuery] string sort = CatalogQuery.DefaultSort,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = CatalogQuery.DefaultPageSize,
            [FromQuery] string? currency = null)
        {
            // Каталог уже в валюте покупателя, поэтому minPrice/maxPrice сравниваются с ценами
            // этой же валюты — фильтр «до 20» означает 20 евро в евро, а не 20 долларов.
            var catalog = await GetCatalogInCurrencyAsync(currency);
            var chart = await GetWeeklyChartAsync();
            var popularityRank = chart
                .Select((entry, index) => (entry.GameId, index))
                .ToDictionary(pair => pair.GameId, pair => pair.index);

            var result = CatalogQuery.Apply(
                catalog,
                new CatalogQueryOptions(
                    q,
                    SplitList(categories),
                    categoryQuery,
                    categorySlug,
                    SplitList(platforms),
                    minPrice,
                    maxPrice,
                    onSale,
                    inStock,
                    comingSoon,
                    sort,
                    page,
                    pageSize),
                popularityRank);

            return Ok(new
            {
                items = result.Items.Select(ToCardDto),
                total = result.Total,
                page = result.Page,
                pageSize = result.PageSize,
                priceRange = new { min = result.PriceRange.Min, max = result.PriceRange.Max },
                facets = new
                {
                    categories = result.Facets.Categories.Select(facet => new { value = facet.Value, count = facet.Count }),
                    platforms = result.Facets.Platforms.Select(facet => new { value = facet.Value, count = facet.Count }),
                    availability = new
                    {
                        inStock = result.Facets.Availability.InStock,
                        onSale = result.Facets.Availability.OnSale,
                        comingSoon = result.Facets.Availability.ComingSoon
                    },
                    priceHistogram = result.Facets.PriceHistogram.Select(bucket => new
                    {
                        from = bucket.From,
                        to = bucket.To,
                        count = bucket.Count
                    }),
                    pricePresets = result.Facets.PricePresets.Select(preset => new
                    {
                        label = preset.Label,
                        from = preset.From,
                        to = preset.To,
                        count = preset.Count
                    })
                }
            });
        }

        /// <summary>Список значений из строки запроса вида `?platforms=PC,Mac`.</summary>
        private static string[] SplitList(string value) =>
            (value ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        /// <summary>
        /// Карточка товара для витрины. Один вид ответа и для полок, и для сетки каталога —
        /// иначе поля начали бы расходиться между страницами.
        /// </summary>
        private static object ToCardDto(CatalogItem item) => new
        {
            id = item.Id,
            slug = item.Slug,
            name = item.Name,
            description = item.Description,
            title = item.Title,
            gameType = item.GameType,
            category = item.Category,
            imagePath = item.ImagePath,
            coverMediaId = item.CoverMediaId,
            releaseDate = item.ReleaseDate,
            isComingSoon = item.IsComingSoon,
            price = item.Price,
            finalPrice = item.FinalPrice,
            // Валюта едет вместе с ценой: витрина форматирует ровно то, что ей дали,
            // и разойтись с расчётом уже не может.
            currency = item.Currency,
            discountPercent = item.DiscountPercent,
            discountActive = item.DiscountActive,
            // Когда скидка закончится (UTC) — витрина рисует обратный отсчёт «deal ends in…».
            discountEndsAt = item.DiscountEndsAt,
            genres = item.Genres,
            platforms = item.Platforms,
            rating = item.Rating,
            reviewCount = item.ReviewCount,
            inStock = item.InStock,
            lowStockLeft = item.LowStockLeft,
            showInFeaturedStorefront = item.ShowInFeaturedStorefront,
            featuredStorefrontPriority = item.FeaturedStorefrontPriority
        };

        [HttpGet("{id}")]
        public async Task<IActionResult> GetGameById(string id, [FromQuery] string? currency = null)
        {
            var game = await _gameRepository.GetByIdAsync(id);
            if (game == null)
            {
                return NotFound();
            }

            // Карточка товара обязана отвечать в той же валюте, что каталог и чекаут: сюда
            // ходит корзина, чтобы обновить цены после смены валюты.
            var requestedCurrency = _currencies.Resolve(currency);
            var priceInCurrency = SuperBot.Core.Payments.GamePricing.TryGetPrice(game, requestedCurrency, _fxRates.Current(), _fx);
            if (priceInCurrency is null)
            {
                // В этой валюте товар не продаётся — как и в каталоге, молчим о нём.
                return NotFound();
            }

            var discount = await _gameDiscountRepository.GetByGameIdAsync(id);
            var details = await _gameDetailsRepository.GetByGameIdAsync(id);
            // Та же логика, что в списке: релиз-статус от сервера, скидка на невышедшую гасится.
            var isComingSoon = GameRelease.IsUpcoming(game.ReleaseDate, DateTime.UtcNow);
            var discountActive = !isComingSoon && discount is not null && discount.IsActiveAt(DateTime.UtcNow);
            var discountPercent = discountActive ? discount!.DiscountPercent : (decimal?)null;
            // Скидка — процент, она валютно-нейтральна, но применяется к цене этой валюты.
            var finalPrice = CalculateFinalPrice(priceInCurrency.Value, discountPercent);
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
                price = priceInCurrency.Value,
                finalPrice,
                currency = requestedCurrency,
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
            _catalogSnapshot.Invalidate();
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
            _catalogSnapshot.Invalidate();
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
            _catalogSnapshot.Invalidate();
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
