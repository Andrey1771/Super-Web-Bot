using SuperBot.Infrastructure.Mapping;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Services;
using SuperBot.WebApi.Services;
using SuperBot.WebApi.Services.Storefront;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class GameController : ControllerBase
    {
        /// <summary>Окно «недельного чарта» продаж на витрине.</summary>
        private const int WeeklyChartWindowDays = 7;
        /// <summary>Добор полки «Popular this week»: когда недельных продаж мало, дальше идут продажи за месяц.</summary>
        private const int SalesFillWindowDays = 30;
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
        /// <summary>Склад ключей: по нему считается регион активации карточки — партии бывают ограничены сильнее игры.</summary>
        private readonly IGameKeyRepository _gameKeys;
        private readonly IGameDiscountRepository _gameDiscountRepository;
        private readonly IGameDetailsRepository _gameDetailsRepository;
        private readonly IMediaAssetRepository _mediaRepository;
        private readonly IOrderRepository _orderRepository;
        private readonly ICatalogSnapshotService _catalogSnapshot;
        private readonly SuperBot.WebApi.Services.Storefront.IDealSpotlightService _dealSpotlight;
        private readonly IMemoryCache _memoryCache;
        private readonly IMapper _mapper;
        private readonly SuperBot.Core.Payments.StorefrontCurrencyOptions _currencies;
        private readonly SuperBot.Infrastructure.Services.IFxRateService _fxRates;
        private readonly SuperBot.Core.Payments.FxOptions _fx;
        private readonly SuperBot.Core.Regions.IRegionCatalogProvider _regions;

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
            Microsoft.Extensions.Options.IOptionsSnapshot<SuperBot.Core.Payments.FxOptions> fx,
            SuperBot.Core.Regions.IRegionCatalogProvider regions,
            IGameKeyRepository gameKeys,
            SuperBot.WebApi.Services.Storefront.IDealSpotlightService dealSpotlight)
        {
            _dealSpotlight = dealSpotlight;
            _gameKeys = gameKeys;
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
            _regions = regions;
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

            // Наружу — только недельные продажи: месячный хвост нужен полке и сортировке, а не этому агрегату.
            return Ok(chart.Where(entry => entry.Sold > 0).Take(limit));
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
            var now = DateTime.UtcNow;
            var weekSince = now.AddDays(-WeeklyChartWindowDays);
            // Читаем месяц одним запросом: недельный чарт и месячный добор считаются из одних заказов.
            var orders = await _orderRepository.GetPaidOrdersSinceAsync(now.AddDays(-SalesFillWindowDays));
            var soldWeek = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var soldMonth = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

            void AddSold(string? gameId, int quantity, bool thisWeek)
            {
                if (string.IsNullOrWhiteSpace(gameId) || quantity <= 0)
                {
                    return;
                }
                soldMonth[gameId] = soldMonth.TryGetValue(gameId, out var month) ? month + quantity : quantity;
                if (thisWeek)
                {
                    soldWeek[gameId] = soldWeek.TryGetValue(gameId, out var week) ? week + quantity : quantity;
                }
            }

            foreach (var order in orders)
            {
                var thisWeek = (order.PaidAt ?? order.OrderDate) >= weekSince;
                var hasItemLines = order.Items != null && order.Items.Count > 0;
                if (hasItemLines)
                {
                    foreach (var item in order.Items!)
                    {
                        AddSold(item.GameId, item.Quantity, thisWeek);
                    }
                }
                else
                {
                    // Заказ ранних версий: списка позиций нет, покупка описана полями самого заказа.
                    AddSold(order.GameId, LegacyOrderSoldQuantity, thisWeek);
                }
            }

            // Сначала недельные продажи, потом месячный хвост — так полка и сортировка «Most popular» не пустеют в тихую неделю.
            return soldMonth.Keys
                .Select(gameId => new WeeklyChartEntry(gameId, soldWeek.TryGetValue(gameId, out var week) ? week : 0, soldMonth[gameId]))
                .OrderByDescending(entry => entry.Sold)
                .ThenByDescending(entry => entry.SoldLast30Days)
                .Take(WeeklyChartMaxLimit)
                .ToList();
        }

        /// <summary>Строка чарта продаж. Именованный тип, а не анонимный: значение кладётся в кэш.</summary>
        /// <param name="Sold">Продано за неделю.</param>
        /// <param name="SoldLast30Days">Продано за месяц (включая неделю) — для добора полки и сортировки.</param>
        public sealed record WeeklyChartEntry(string GameId, int Sold, int SoldLast30Days = 0);

        /// Здесь был GET /api/game — весь каталог одним списком. Его убрали: он отдавал
        /// мегабайты (на тридцати тысячах игр — десятки), а нужны из него были полки главной
        /// и сетка каталога. Полки собирает <see cref="GetHome"/>, сетку — постраничный
        /// <see cref="GetCatalog"/>; отдельного «дай всё» у витрины больше нет.

        /// <summary>Размеры полок главной. Совпадают с тем, что витрина показывает.</summary>
        private const int HomeShelfCapacity = 8;
        private const int HomeHeroCapacity = 7;
        private const int HomeMoodCapacity = 3;

        /// <summary>
        /// Главная страница одним запросом: витрине уезжают только карточки полок, а не каталог.
        ///
        /// Раньше главная забирала /api/game — то есть ВЕСЬ каталог — и нарезала полки в браузере.
        /// На тысяче игр это работало, на тридцати тысячах это мегабайты каждому посетителю ради
        /// шести десятков карточек. Отбор и порядок полок считаются здесь, по снимку каталога,
        /// который и так лежит в памяти сервера.
        ///
        /// budgetMax и moods приходят с витрины: это её правила оформления (какая цена считается
        /// «недорого» и какие настроения показывать), и держать их копию на сервере незачем.
        /// </summary>
        [HttpGet("home")]
        public async Task<IActionResult> GetHome(
            [FromQuery] string? currency = null,
            [FromQuery] decimal budgetMax = 10,
            [FromQuery] string moods = "")
        {
            var fullCatalog = await GetCatalogInCurrencyAsync(currency);
            // Полки главной — игровые: ПО в «новинках» и «под настроение» было бы чужим.
            // Полка «Software deals» на главной была и снята: по дизайну не вписалась. ПО живёт в своём разделе /software.
            var catalog = fullCatalog.Where(item => item.Kind == ProductKind.Game).ToList();
            var regionCatalog = _regions.Current;
            var buyerCountry = SuperBot.WebApi.Services.Regions.BuyerCountry.Resolve(Request);

            var byRelease = catalog.OrderByDescending(item => item.ReleaseDate).ToList();
            var released = byRelease.Where(item => !item.IsComingSoon).ToList();

            // Что считается скидкой, решает каталог: полка главной и фильтр «On sale»
            // обязаны отбирать одно и то же, иначе полка показывает игру, которой в
            // каталоге по этому же фильтру нет.
            static bool HasVisibleDiscount(CatalogItem item) => CatalogQuery.IsOnSale(item);

            // Карусель: скидочные вперёд — витрина сама подсвечивает выгоду; внутри групп
            // сохраняется порядок «свежие первыми».
            var hero = byRelease.Where(HasVisibleDiscount)
                .Concat(byRelease.Where(item => !HasVisibleDiscount(item)))
                .Take(HomeHeroCapacity)
                .ToList();

            var upcoming = catalog
                .Where(item => item.IsComingSoon)
                .OrderBy(item => item.ReleaseDate)
                .Take(HomeShelfCapacity)
                .ToList();

            var newReleases = released.Take(HomeShelfCapacity).ToList();

            var deals = released
                .Where(HasVisibleDiscount)
                .OrderByDescending(item => item.DiscountPercent ?? 0)
                .Take(HomeShelfCapacity)
                .ToList();

            // Таймер полки тикает к самому ближнему концу скидки ИЗ ПОКАЗАННЫХ: обещать
            // отсчёт по игре, которой на полке нет, значит показывать чужой таймер.
            var nearestDealEndsAt = deals
                .Select(item => item.DiscountEndsAt)
                .Where(end => end.HasValue)
                .OrderBy(end => end!.Value)
                .FirstOrDefault();

            var budget = released
                .Where(item => item.FinalPrice > 0 && item.FinalPrice <= budgetMax)
                .OrderBy(item => item.FinalPrice)
                .Take(HomeShelfCapacity)
                .ToList();

            var editorsPicks = released
                .Where(item => item.ShowInFeaturedStorefront)
                .OrderBy(item => item.FeaturedStorefrontPriority)
                .Take(HomeShelfCapacity)
                .ToList();

            // Чарт задаёт порядок, карточки берём из каталога: сам агрегат цен не знает.
            var releasedById = released
                .Where(item => !string.IsNullOrWhiteSpace(item.Id))
                .ToDictionary(item => item.Id!, StringComparer.OrdinalIgnoreCase);
            var chart = await GetWeeklyChartAsync();
            // Полка всегда полная: продажи недели, потом месяца, потом лучшие по рейтингу в наличии (см. PopularShelf).
            var popularShelf = SuperBot.WebApi.Services.Storefront.PopularShelf.Build(chart, released, HomeShelfCapacity, DateTime.UtcNow);
            var popular = popularShelf.Items.ToList();

            var (spotlightHeroId, spotlightWingIds) = await _dealSpotlight.ResolveAsync();
            var spotlightHero = spotlightHeroId != null
                                && releasedById.TryGetValue(spotlightHeroId, out var heroItem)
                                && heroItem.DiscountActive
                ? heroItem
                : null;
            var byId = catalog
                .Where(item => !string.IsNullOrWhiteSpace(item.Id))
                .ToDictionary(item => item.Id!, StringComparer.OrdinalIgnoreCase);
            var spotlightWings = spotlightWingIds
                .Select(id => byId.TryGetValue(id, out var wing) ? wing : null)
                .Where(item => item is not null)
                .Select(item => item!)
                .ToList();

            // Настроения: совпадение по жанру мягкое (подстрока) — «RPG» находит
            // «Role-Playing Games (RPGs)», как и раньше на витрине.
            var moodShelves = new Dictionary<string, List<CatalogItem>>(StringComparer.OrdinalIgnoreCase);
            foreach (var mood in (moods ?? string.Empty)
                         .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                         .Distinct(StringComparer.OrdinalIgnoreCase))
            {
                moodShelves[mood] = released
                    .Where(item => (item.Genres ?? Array.Empty<string>())
                        .Any(genre => genre.Contains(mood, StringComparison.OrdinalIgnoreCase)))
                    .Take(HomeMoodCapacity)
                    .ToList();
            }

            // Регион и остаток ключей запрашиваем только по тем играм, что реально уедут на
            // витрину: раньше это делалось по всему каталогу, потому что каталог и уезжал.
            var shown = hero
                .Concat(upcoming).Concat(newReleases).Concat(deals).Concat(budget)
                .Concat(editorsPicks).Concat(popular).Concat(spotlightWings)
                .Concat(moodShelves.Values.SelectMany(items => items));
            if (spotlightHero is not null)
            {
                shown = shown.Append(spotlightHero);
            }

            var shownItems = shown.ToList();
            var titles = await LoadTaxonomyTitlesAsync();
            var activation = await _gameKeys.GetActivationInfoAsync(
                shownItems.Select(item => item.Id).Where(id => !string.IsNullOrWhiteSpace(id)).Distinct().ToList());

            // Карточки отдаём справочником, а полки — списками id. Одна и та же игра легко
            // попадает на четыре полки сразу (свежая, со скидкой, недорогая, в настроении), и
            // при выдаче карточками ответ раздувается вдвое на ровном месте.
            var cards = shownItems
                .Where(item => !string.IsNullOrWhiteSpace(item.Id))
                .GroupBy(item => item.Id!, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(
                    group => group.Key,
                    group => StorefrontCards.ToCardDto(group.First(), regionCatalog, buyerCountry, activation, titles),
                    StringComparer.OrdinalIgnoreCase);

            static List<string> Ids(IEnumerable<CatalogItem> items) =>
                items.Select(item => item.Id!).Where(id => !string.IsNullOrWhiteSpace(id)).ToList();

            // Сколько всего игр за каждой ссылкой «All …». Полка показывает восемь карточек,
            // а ссылка ведёт в каталог с фильтром — и число рядом с ней говорит, сколько там
            // на самом деле. Считаем ровно тем запросом, который выполнит каталог после
            // перехода (те же фильтры, то же скрытие DLC): иначе подпись обещала бы одно,
            // а страница показывала другое.
            static CatalogQueryOptions Destination(
                decimal? maxPrice = null,
                bool onSale = false,
                bool comingSoon = false) =>
                new(null, Array.Empty<string>(), null, null, Array.Empty<string>(),
                    null, maxPrice, onSale, false, comingSoon,
                    CatalogQuery.DefaultSort, 1, CatalogQuery.DefaultPageSize);

            var totals = new
            {
                games = CatalogQuery.Count(catalog, Destination()),
                deals = CatalogQuery.Count(catalog, Destination(onSale: true)),
                upcoming = CatalogQuery.Count(catalog, Destination(comingSoon: true)),
                budget = CatalogQuery.Count(catalog, Destination(maxPrice: budgetMax)),
                software = CatalogQuery.Count(fullCatalog, Destination() with { Kind = ProductKind.Software }),
            };

            return Ok(new
            {
                games = cards,
                totals,
                hero = Ids(hero),
                upcoming = Ids(upcoming),
                newReleases = Ids(newReleases),
                deals = Ids(deals),
                nearestDealEndsAt,
                budget = Ids(budget),
                editorsPicks = Ids(editorsPicks),
                popularThisWeek = Ids(popular),
                // Сколько на полке настоящих недельных продаж: меньше полки — витрина меняет подпись.
                popularThisWeekSold = popularShelf.SoldThisWeek,
                dealOfWeek = new
                {
                    heroId = spotlightHero?.Id,
                    wingIds = Ids(spotlightWings)
                },
                moods = moodShelves.ToDictionary(pair => pair.Key, pair => Ids(pair.Value))
            });
        }

        /// <summary>
        /// Каталог, приведённый к валюте покупателя. Валюту берём только из списка витрины:
        /// произвольный ?currency= в адресе не должен показывать цены в валюте, в которой их
        /// никто не назначал.
        /// </summary>
        private async Task<IReadOnlyList<CatalogItem>> GetCatalogInCurrencyAsync(string? requested, bool includeDrafts = false)
        {
            // Приведённый к валюте каталог кэшируется вместе со снимком: одна конвертация на валюту, а не на запрос.
            return await _catalogSnapshot.GetInCurrencyAsync(_currencies.Resolve(requested), _fxRates.Current(), _fx, includeDrafts);
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
            [FromQuery] string? currency = null,
            [FromQuery] string? studio = null,
            [FromQuery] string? tag = null,
            [FromQuery] bool includeDlc = false,
            [FromQuery] string? kind = null,
            [FromQuery] string? softwareCategory = null,
            [FromQuery] string terms = "",
            [FromQuery] string devices = "",
            [FromQuery] string activation = "",
            [FromQuery] bool includeDrafts = false,
            [FromQuery] string? status = null)
        {
            // Черновики — только админу: список товаров и поиск в админке. Остальным параметр ничего не меняет.
            var withDrafts = includeDrafts && User.IsInRole("admin");
            // Каталог уже в валюте покупателя, поэтому minPrice/maxPrice сравниваются с ценами
            // этой же валюты — фильтр «до 20» означает 20 евро в евро, а не 20 долларов.
            var catalog = await GetCatalogInCurrencyAsync(currency, withDrafts);
            // Отбор по публикации — для списка админки («только черновики»). Без черновиков в каталоге он не нужен.
            if (withDrafts && !string.IsNullOrWhiteSpace(status))
            {
                var drafts = string.Equals(status, "draft", StringComparison.OrdinalIgnoreCase);
                if (drafts || string.Equals(status, "published", StringComparison.OrdinalIgnoreCase))
                {
                    catalog = catalog.Where(item => item.IsDraft == drafts).ToList();
                }
            }
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
                    pageSize,
                    studio,
                    tag,
                    includeDlc,
                    ParseKind(kind),
                    softwareCategory,
                    SplitList(terms),
                    SplitList(devices),
                    SplitList(activation)),
                popularityRank);

            // Страна покупателя нужна здесь, а не в снимке: снимок общий, а вердикт личный.
            var regionCatalog = _regions.Current;
            var buyerCountry = SuperBot.WebApi.Services.Regions.BuyerCountry.Resolve(Request);

            var keyActivation = await _gameKeys.GetActivationInfoAsync(
                result.Items.Select(item => item.Id).Where(id => !string.IsNullOrWhiteSpace(id)).ToList());
            // Подписи жанров и категорий — на языке покупателя; значения фильтров остаются английскими.
            // Список админки (с черновиками) — по-английски: форма редактирует английские поля, а не переводы.
            var titles = await LoadTaxonomyTitlesAsync(english: withDrafts);

            return Ok(new
            {
                items = result.Items.Select(item => StorefrontCards.ToCardDto(item, regionCatalog, buyerCountry, keyActivation, titles)),
                total = result.Total,
                page = result.Page,
                pageSize = result.PageSize,
                priceRange = new { min = result.PriceRange.Min, max = result.PriceRange.Max },
                facets = new
                {
                    categories = result.Facets.Categories.Select(facet => new { value = facet.Value, label = titles.GenreLabel(facet.Value), count = facet.Count }),
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
                    }),
                    software = new
                    {
                        categories = result.Facets.Software.Categories.Select(facet => new { value = facet.Value, count = facet.Count }),
                        terms = result.Facets.Software.LicenseTerms.Select(facet => new { value = facet.Value, count = facet.Count }),
                        devices = result.Facets.Software.Devices.Select(facet => new { value = facet.Value, count = facet.Count }),
                        activation = result.Facets.Software.Activation.Select(facet => new { value = facet.Value, count = facet.Count })
                    },
                    kinds = result.Facets.Kinds.Select(facet => new { value = facet.Value, count = facet.Count })
                }
            });
        }

        /// <summary>Названия жанров и категорий ПО на языке запроса (Accept-Language) — для карточек и фасетов.</summary>
        private Task<SuperBot.WebApi.Services.Storefront.TaxonomyTitles> LoadTaxonomyTitlesAsync(bool english = false) =>
            SuperBot.WebApi.Services.Storefront.TaxonomyTitles.LoadAsync(
                HttpContext.RequestServices.GetRequiredService<IGameGenreDirectory>(),
                HttpContext.RequestServices.GetRequiredService<ISoftwareCategoryDirectory>(),
                english ? null : SuperBot.WebApi.Services.BuyerLanguage.Resolve(Request));

        /// <summary>
        /// Вид товара из адреса: «software» — ПО, «all» — оба вида (общий поиск), иначе игры. По умолчанию игры —
        /// так работали все ссылки витрины до появления ПО.
        /// </summary>
        public static ProductKind? ParseKind(string? kind) =>
            kind?.Trim().ToLowerInvariant() switch
            {
                "software" => ProductKind.Software,
                "all" => null,
                _ => ProductKind.Game
            };

        /// <summary>
        /// Жанры игр в порядке настроек и с числом опубликованных игр (без DLC) — для фильтра, подвала и заголовков страниц
        /// жанров. Код (tag) — адрес страницы жанра (/games/category/{tag}).
        /// </summary>
        [HttpGet("genres")]
        public async Task<IActionResult> GetGenres([FromServices] IGameGenreDirectory genreDirectory)
        {
            var catalog = await _catalogSnapshot.GetAsync();
            var counts = catalog
                .Where(item => item.Kind == ProductKind.Game && item.ParentGameId is null && !string.IsNullOrWhiteSpace(item.Genre))
                .GroupBy(item => item.Genre!, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(group => group.Key, group => group.Count(), StringComparer.OrdinalIgnoreCase);
            var genres = await genreDirectory.GetAsync();
            var locale = SuperBot.WebApi.Services.BuyerLanguage.Resolve(Request);
            return Ok(genres.Select(genre => new
            {
                tag = genre.Tag,
                title = genre.Title,
                // Подпись на языке покупателя; title остаётся английским — по нему строятся адреса и фильтры.
                label = genre.TitleFor(locale),
                count = counts.TryGetValue(genre.Tag, out var count) ? count : 0
            }));
        }

        /// <summary>
        /// Категории софта в порядке настроек и с числом товаров — для плиток в режиме софта каталога и плашки «Browse software».
        /// Пустые категории тоже отдаём: витрина сама решает, прятать ли их.
        /// </summary>
        [HttpGet("software-categories")]
        public async Task<IActionResult> GetSoftwareCategories([FromServices] ISoftwareCategoryDirectory softwareCategories, [FromQuery] string? currency = null)
        {
            // Сначала отбираем софт, потом переводим в валюту: конвертировать весь каталог ради счёта незачем,
            // а товар без цены в валюте покупателя в каталоге не показывается — и в счётчике его быть не должно.
            var software = (await _catalogSnapshot.GetAsync())
                .Where(item => item.Kind == ProductKind.Software && item.ParentGameId is null && !string.IsNullOrWhiteSpace(item.SoftwareCategory))
                .ToList();
            var counts = CatalogPricing.InCurrency(software, _currencies.Resolve(currency), _fxRates.Current(), _fx)
                .GroupBy(item => item.SoftwareCategory!, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(group => group.Key, group => group.Count(), StringComparer.OrdinalIgnoreCase);
            var categories = await softwareCategories.GetAsync();
            var locale = SuperBot.WebApi.Services.BuyerLanguage.Resolve(Request);

            return Ok(new
            {
                total = counts.Values.Sum(),
                categories = categories
                    .Where(category => !string.IsNullOrWhiteSpace(category?.Tag))
                    .Select(category => new
                    {
                        tag = category.Tag,
                        title = category.Title,
                        label = category.TitleFor(locale),
                        count = counts.TryGetValue(category.Tag, out var count) ? count : 0
                    })
            });
        }

        /// <summary>
        /// Проставляет игре жанр из списка настроек. null — всё в порядке, иначе текст ошибки для админа.
        /// Номер GameType держим в согласии с кодом, пока жанр из прежних двенадцати: его читают старые клиенты и аналитика.
        /// </summary>
        private async Task<string?> ApplyGenreAsync(Game game, string? requestedTag, GameType fallbackType)
        {
            var tag = (string.IsNullOrWhiteSpace(requestedTag) ? GameGenres.LegacyTag(fallbackType) : requestedTag).Trim().ToLowerInvariant();
            var genres = await HttpContext.RequestServices.GetRequiredService<IGameGenreDirectory>().GetAsync();
            if (!genres.Any(genre => string.Equals(genre.Tag, tag, StringComparison.OrdinalIgnoreCase)))
            {
                return $"Unknown genre “{tag}” — pick one from the list.";
            }
            game.Genre = tag;
            game.GameType = GameGenres.LegacyType(tag) ?? fallbackType;
            return null;
        }

        /// <summary>Список значений из строки запроса вида `?platforms=PC,Mac`.</summary>
        private static string[] SplitList(string value) =>
            (value ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        /// <summary>
        /// Карточка товара для витрины. Один вид ответа и для полок, и для сетки каталога —
        /// иначе поля начали бы расходиться между страницами.
        /// </summary>
        [HttpGet("{id}")]
        public async Task<IActionResult> GetGameById(
            string id,
            [FromQuery] string? currency = null,
            [FromQuery] string? editionCode = null,
            [FromQuery] string? offerKey = null)
        {
            var game = await _gameRepository.GetByIdAsync(id);
            if (game == null)
            {
                return NotFound();
            }

            // Карточка товара обязана отвечать в той же валюте, что каталог и чекаут: сюда
            // ходит корзина, чтобы обновить цены после смены валюты.
            var requestedCurrency = _currencies.Resolve(currency);
            var details = await _gameDetailsRepository.GetByGameIdAsync(id);

            // Корзина после смены валюты перечитывает цену позиции; у позиции с изданием — цену издания,
            // по тем же правилам, что карточка и чекаут (ручная цена издания → курс от его базовой).
            SuperBot.Core.Entities.GameEdition? edition = null;
            if (!string.IsNullOrWhiteSpace(editionCode))
            {
                edition = details?.Editions?.FirstOrDefault(e => string.Equals(e.Code, editionCode.Trim(), StringComparison.OrdinalIgnoreCase));
                if (edition is null)
                {
                    return NotFound();
                }
            }
            // Вариант ключа важнее общей цены: покупатель выбрал европейский за 46.99, и
            // пересчёт корзины обязан вернуть именно его цену, а не цену игры. Без варианта
            // (обычный случай) всё как было: цена издания, иначе цена игры.
            var priceInCurrency = !string.IsNullOrWhiteSpace(offerKey)
                ? SuperBot.Core.Payments.RegionOfferPricing.TryGetPrice(game, offerKey, edition?.Code ?? editionCode, requestedCurrency, _fxRates.Current(), _fx,
                    edition, GameEditions.IsDefaultIn(details?.Editions, edition))
                : edition is null
                    ? SuperBot.Core.Payments.GamePricing.TryGetPrice(game, requestedCurrency, _fxRates.Current(), _fx)
                    : SuperBot.Core.Payments.GamePricing.TryGetEditionPrice(edition, game, requestedCurrency, _fxRates.Current(), _fx);
            if (priceInCurrency is null)
            {
                // В этой валюте товар не продаётся — как и в каталоге, молчим о нём.
                return NotFound();
            }

            var discount = await _gameDiscountRepository.GetByGameIdAsync(id);

            // Та же логика, что в списке: релиз-статус от сервера, скидка на невышедшую гасится.
            var isComingSoon = GameRelease.IsUpcoming(game.ReleaseDate, DateTime.UtcNow);
            var discountActive = !isComingSoon && discount is not null && discount.IsActiveAt(DateTime.UtcNow);
            var discountPercent = discountActive ? discount!.DiscountPercent : (decimal?)null;
            // Своя скидка издания важнее общей скидки игры — как на странице и в чекауте.
            if (edition?.DiscountPercent is > 0)
            {
                discountPercent = edition.DiscountPercent;
            }
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
                parentGameId = game.ParentGameId,
                isDlc = !string.IsNullOrWhiteSpace(game.ParentGameId),
                editionCode = edition?.Code,
                editionTitle = edition?.Title,
                gameType = game.GameType,
                genre = game.Kind == ProductKind.Software ? null : GameGenres.TagOf(game),
                kind = game.Kind.ToString(),
                softwareCategory = game.SoftwareCategory,
                imagePath = resolvedImagePath,
                coverMediaId = game.CoverMediaId,
                releaseDate = game.ReleaseDate,
                isComingSoon,
                price = priceInCurrency.Value,
                finalPrice,
                currency = requestedCurrency,
                discountPercent,
                discountActive,
                genres = genres.Length > 0
                    ? genres
                    : game.Kind == ProductKind.Software
                        ? Array.Empty<string>()
                        : new[] { (await LoadTaxonomyTitlesAsync()).GenreLabel(GameGenres.TitleOf(await HttpContext.RequestServices.GetRequiredService<IGameGenreDirectory>().GetAsync(), GameGenres.TagOf(game))) },
                platforms = BuildPlatformLabels(details?.Platforms),
                showInFeaturedStorefront = details?.ShowInFeaturedStorefront ?? false,
                featuredStorefrontPriority = details?.FeaturedStorefrontPriority ?? int.MaxValue
            });
        }

        [HttpPost]
        [Authorize(Roles = "admin")]
        /// <param name="draft">
        /// Создать черновиком: товар не виден на витрине, пока его не опубликуют в редакторе карточки. Админка по умолчанию
        /// создаёт черновик — иначе товар попадал в магазин сразу, без лицензий, ключей и обложки. Без параметра — как раньше,
        /// опубликованным.
        /// </param>
        public async Task<IActionResult> CreateGame([FromBody] Game newGame, [FromServices] ISoftwareCategoryDirectory softwareCategories, [FromQuery] bool draft = false)
        {
            var game = _mapper.Map<Game>(newGame);
            if (game.Kind == ProductKind.Software)
            {
                // Категория ПО — из списка раздела: без неё товар не попал бы ни в одну категорию софта.
                var categories = await softwareCategories.GetAsync();
                var tag = game.SoftwareCategory?.Trim().ToLowerInvariant();
                if (string.IsNullOrWhiteSpace(tag) || !categories.Any(category => string.Equals(category.Tag, tag, StringComparison.OrdinalIgnoreCase)))
                {
                    return BadRequest(new { message = "Pick a software category from the list." });
                }
                if (!string.IsNullOrWhiteSpace(game.ParentGameId))
                {
                    return BadRequest(new { message = "A DLC can't be software." });
                }
                game.SoftwareCategory = tag;
                // У ПО жанра нет, что бы ни прислала форма.
                game.Genre = null;
            }
            else
            {
                game.SoftwareCategory = null;
                // Жанр — из списка в настройках. Старые клиенты шлют только номер GameType — из него выводится код.
                var genreError = await ApplyGenreAsync(game, game.Genre, fallbackType: game.GameType);
                if (genreError is not null)
                {
                    return BadRequest(new { message = genreError });
                }
            }
            // Id назначаем сами: репозиторий не пишет его обратно, а без него ответ не скажет, какой товар создан,
            // и черновику не к чему привязать карточку.
            if (string.IsNullOrWhiteSpace(game.Id))
            {
                game.Id = MongoDB.Bson.ObjectId.GenerateNewId().ToString();
            }
            await _gameRepository.CreateAsync(game);
            if (draft)
            {
                // Черновик — признак карточки: товар без карточки витрина считает опубликованным.
                await _gameDetailsRepository.UpsertAsync(new GameDetails
                {
                    GameId = game.Id,
                    Slug = game.Slug,
                    Title = string.IsNullOrWhiteSpace(game.Title) ? game.Name : game.Title,
                    IsDraft = true
                });
            }
            _catalogSnapshot.Invalidate();
            return CreatedAtAction(nameof(GetGameById), new { id = game.Id }, game);
        }

        /// <summary>
        /// Поля товара, которые правит форма каталога. Частичное обновление: чего в теле нет — то не трогаем.
        /// Раньше сюда приходил Game целиком и подменял документ; поля других экранов (порог и дата «мало ключей»,
        /// политика и цены регионов, прайс-лист, вид товара) переживали сохранение только по одному, если
        /// кто-то догадался дописать для них «??=», — остальные молча обнулялись.
        /// </summary>
        public sealed class GameUpdateRequest
        {
            public string? Name { get; set; }
            public string? Title { get; set; }
            public string? Description { get; set; }
            /// <summary>Переводы описания (ru/uk/pl); отсутствует — не трогать, пустой словарь — снять переводы.</summary>
            public Dictionary<string, string>? DescriptionI18n { get; set; }
            public string? Slug { get; set; }
            public string? ExternalId { get; set; }
            public decimal? Price { get; set; }
            /// <summary>Отсутствует — не трогать; пустой объект — снять все ручные цены (System.Text.Json их различает).</summary>
            public Dictionary<string, decimal>? Prices { get; set; }
            public GameType? GameType { get; set; }
            public string? Genre { get; set; }
            public string? ImagePath { get; set; }
            /// <summary>Пустая строка — снять обложку из медиатеки.</summary>
            public string? CoverMediaId { get; set; }
            public DateTime? ReleaseDate { get; set; }
            /// <summary>Пустая строка — «не DLC».</summary>
            public string? ParentGameId { get; set; }
        }

        [HttpPut("{id}")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> UpdateGame(string id, [FromBody] GameUpdateRequest updatedGame)
        {
            var game = await _gameRepository.GetByIdAsync(id);
            if (game == null)
            {
                return NotFound();
            }

            if (updatedGame.Name is not null) game.Name = updatedGame.Name;
            if (updatedGame.Title is not null) game.Title = updatedGame.Title;
            if (updatedGame.Description is not null) game.Description = updatedGame.Description;
            if (updatedGame.DescriptionI18n is not null) game.DescriptionI18n = Localized.Normalize(updatedGame.DescriptionI18n);
            if (!string.IsNullOrWhiteSpace(updatedGame.Slug)) game.Slug = updatedGame.Slug;
            if (updatedGame.ExternalId is not null) game.ExternalId = updatedGame.ExternalId;
            if (updatedGame.Price is not null) game.Price = updatedGame.Price.Value;
            if (updatedGame.Prices is not null) game.Prices = updatedGame.Prices;
            if (updatedGame.ImagePath is not null) game.ImagePath = updatedGame.ImagePath;
            if (updatedGame.CoverMediaId is not null) game.CoverMediaId = string.IsNullOrWhiteSpace(updatedGame.CoverMediaId) ? null : updatedGame.CoverMediaId;
            if (updatedGame.ReleaseDate is not null) game.ReleaseDate = updatedGame.ReleaseDate.Value;
            if (updatedGame.ParentGameId is not null) game.ParentGameId = string.IsNullOrWhiteSpace(updatedGame.ParentGameId) ? null : updatedGame.ParentGameId;

            // Вид товара и категорию ПО меняет только PUT /api/admin/software/products/{id}/kind — здесь их нет по построению.
            if (game.Kind != ProductKind.Software)
            {
                // Жанр не прислан: старая форма знает только номер — если его сменили, жанр следует за ним, иначе остаётся.
                var previousType = game.GameType;
                if (updatedGame.GameType is not null) game.GameType = updatedGame.GameType.Value;
                var requested = !string.IsNullOrWhiteSpace(updatedGame.Genre)
                    ? updatedGame.Genre
                    : game.GameType != previousType ? GameGenres.LegacyTag(game.GameType) : GameGenres.TagOf(game);
                var genreError = await ApplyGenreAsync(game, requested, fallbackType: previousType);
                if (genreError is not null)
                {
                    return BadRequest(new { message = genreError });
                }
            }
            if (string.Equals(game.ParentGameId, id, StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(new { message = "A game cannot be a DLC of itself." });
            }
            await _gameRepository.UpdateAsync(id, game);
            _catalogSnapshot.Invalidate();
            return NoContent();
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> DeleteGame(string id, [FromServices] IWishlistRepository wishlists)
        {
            var game = await _gameRepository.GetByIdAsync(id);
            if (game == null)
            {
                return NotFound();
            }

            await _gameRepository.DeleteAsync(id);
            await _gameDiscountRepository.DeleteByGameIdAsync(id);
            // Иначе удалённая игра оставалась в чужих списках желаний: счётчик «Saved items» в кабинете
            // считал её, а страница списка показать уже не могла.
            await wishlists.RemoveGameEverywhereAsync(id);
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
