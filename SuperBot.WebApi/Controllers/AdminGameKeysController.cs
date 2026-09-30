using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/admin/keys")]
    [Authorize(Roles = "admin")]
    public class AdminGameKeysController : ControllerBase
    {
        private readonly IGameKeyRepository _gameKeyRepository;
        private readonly IGameRepository _games;
        private readonly IOrderRepository _orders;
        private readonly IKeyFulfillmentService _fulfillment;
        private readonly IDeliveryMailer _deliveryMailer;
        /// <summary>
        /// Сколько игр показывать внутри одной области активации. Список нужен, чтобы понять, что
        /// заливать; полный перечень каталога здесь ни к чему — он есть на вкладке остатков.
        /// </summary>
        private const int GamesPerRegionLimit = 50;

        /// <summary>
        /// Сколько дней запаса считать «скоро кончится». Неделя — время, за которое реально успеть
        /// закупить и залить партию; всё, что меньше, — это уже срочно.
        /// </summary>
        private const int RunningOutSoonDays = 7;

        /// <summary>
        /// Сколько игр отдавать для графиков. Разрез по играм — это то, чем реально пополняют
        /// склад; полсотни серий на одном графике нечитаемы, а для «что закупать» хватает верхушки.
        /// </summary>
        private const int ChartGamesLimit = 12;

        /// <summary>
        /// Сколько строк «игра × партия» брать из базы. Отчёт отвечает на вопрос «что пополнять»,
        /// и для него нужна верхушка самых пустых, а не строка на каждую игру каталога.
        /// </summary>
        private const int StockRowsLimit = 200;

        /// <summary>
        /// Темп продаж и на сколько хватит остатка.
        ///
        /// Делим не на всё окно, а на срок с первой продажи: игра, поступившая в продажу неделю
        /// назад, не должна выглядеть медленной из-за трёх пустых недель до неё. Хвост без продаж
        /// в конце окна, наоборот, сохраняем — он честно снижает темп, потому что спрос упал.
        ///
        /// Продаж не было — прогноза нет: делить на ноль и обещать «хватит навсегда» одинаково
        /// бессмысленно.
        /// </summary>
        /// <summary>
        /// Склад изменился — снимок каталога устарел.
        ///
        /// Снимок живёт две минуты и знает, что «в наличии»: без сброса залитые ключи доезжали бы
        /// до витрины и до складского экрана с задержкой, и админ видел бы ноль сразу после того,
        /// как сам залил сотню ключей.
        /// </summary>
        private void StockChanged() => _catalogSnapshot.Invalidate();

        private static (double? PerDay, int? DaysLeft, int ActiveDays) Forecast(
            IReadOnlyDictionary<DateTime, int> byDay,
            IReadOnlyList<DateTime> dayLabels,
            int available)
        {
            var sold = byDay.Values.Sum();
            if (sold <= 0 || dayLabels.Count == 0)
            {
                return (null, null, 0);
            }

            var firstSale = byDay.Where(pair => pair.Value > 0).Min(pair => pair.Key);
            var activeDays = Math.Max(1, (dayLabels[^1] - firstSale).Days + 1);
            var perDay = (double)sold / activeDays;

            return (Math.Round(perDay, 2), perDay > 0 ? (int)Math.Floor(available / perDay) : null, activeDays);
        }

        private readonly ILogger<AdminGameKeysController> _logger;

        private readonly SuperBot.WebApi.Services.SiteSettings.StockOptions _stock;
        private readonly SuperBot.Core.Payments.StorefrontCurrencyOptions _currencies;
        /// <summary>Справочник регионов: по нему подписываются области активации на складе.</summary>
        private readonly SuperBot.Core.Regions.IRegionCatalogProvider _regions;
        /// <summary>Снимок каталога: в нём уже посчитан запас каждой игры, и он общий на весь сайт.</summary>
        private readonly SuperBot.WebApi.Services.ICatalogSnapshotService _catalogSnapshot;

        public AdminGameKeysController(
            IGameKeyRepository gameKeyRepository,
            IGameRepository games,
            IOrderRepository orders,
            IKeyFulfillmentService fulfillment,
            IDeliveryMailer deliveryMailer,
            ILogger<AdminGameKeysController> logger,
            Microsoft.Extensions.Options.IOptionsSnapshot<SuperBot.WebApi.Services.SiteSettings.StockOptions> stock,
            Microsoft.Extensions.Options.IOptions<SuperBot.Core.Payments.StorefrontCurrencyOptions> currencies,
            SuperBot.Core.Regions.IRegionCatalogProvider regions,
            SuperBot.WebApi.Services.ICatalogSnapshotService catalogSnapshot)
        {
            _catalogSnapshot = catalogSnapshot;
            _regions = regions;
            _stock = stock.Value;
            _currencies = currencies.Value;
            _gameKeyRepository = gameKeyRepository;
            _games = games;
            _orders = orders;
            _fulfillment = fulfillment;
            _deliveryMailer = deliveryMailer;
            _logger = logger;
        }

        /// <summary>
        /// Запасы ключей по играм: страница строк плюс итоги по всему каталогу.
        ///
        /// Раньше отдавалась строка на каждую игру, и админка сама прятала лишнее. На каталоге в
        /// тридцать тысяч игр это мегабайты ради семи видимых строк, поэтому фильтр, поиск,
        /// сортировка и постраничность переехали на сервер: наружу уходит только то, что покажут.
        ///
        /// Источник — общий снимок каталога: он уже собран для витрины, живёт две минуты и знает
        /// запас каждой игры. Собирать то же самое заново на каждый запрос незачем. Карточки в
        /// черновиках в снимок не попадают — их нет и здесь.
        /// </summary>
        [HttpGet("overview")]
        public async Task<IActionResult> Overview(
            [FromQuery] int? lowThreshold = null,
            [FromQuery] string? query = null,
            [FromQuery] string? status = null,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 25)
        {
            // Без явного порога — общий из настроек сайта (тот же, что видит витрина).
            var threshold = lowThreshold is >= 0 ? lowThreshold.Value : _stock.LowStockThreshold;
            lowThreshold = threshold;

            // Вместе с черновиками: склад у черновика (только что созданная копия товара) уже есть, и дашборд его
            // считает — обзор ключей не должен его прятать.
            var snapshot = await _catalogSnapshot.GetWithDraftsAsync();
            // Сколько ключей «должны» по игре: оплатили, а ключа не было.
            var owed = await _orders.GetOwedKeyCountByGameAsync();

            var rows = snapshot
                .Select(item =>
                {
                    var awaiting = owed.TryGetValue(item.Id, out var owe) ? owe : 0;
                    // Порог у игры в приоритете: у хита продаж «мало» — это пятьдесят, у нишевой — два.
                    var gameThreshold = item.LowStockThreshold ?? threshold;
                    return new
                    {
                        gameId = item.Id,
                        title = string.IsNullOrWhiteSpace(item.Title) ? item.Name : item.Title,
                        available = item.KeysAvailable,
                        delivered = item.KeysDelivered,
                        awaiting,
                        outOfStock = item.KeysAvailable == 0,
                        low = item.KeysAvailable > 0 && item.KeysAvailable <= gameThreshold,
                        lowThreshold = gameThreshold
                    };
                })
                .ToList();

            // Итоги — по всему каталогу, а не по видимой странице: иначе плитки «сколько пусто»
            // меняли бы значение от того, на какой странице стоит админ.
            var totals = new
            {
                games = rows.Count,
                available = rows.Sum(r => r.available),
                delivered = rows.Sum(r => r.delivered),
                awaiting = rows.Sum(r => r.awaiting),
                outOfStock = rows.Count(r => r.outOfStock),
                lowStock = rows.Count(r => r.low)
            };

            var needle = query?.Trim();
            var filtered = rows.AsEnumerable();

            if (!string.IsNullOrWhiteSpace(needle))
            {
                filtered = filtered.Where(r => (r.title ?? string.Empty).Contains(needle, StringComparison.OrdinalIgnoreCase));
            }

            // По умолчанию показываем то, ради чего экран и открывают: где ждут ключа, пусто
            // или заканчивается. Всё остальное — по явному выбору.
            filtered = (status ?? "attention").Trim().ToLowerInvariant() switch
            {
                "all" => filtered,
                "awaiting" => filtered.Where(r => r.awaiting > 0),
                "out" => filtered.Where(r => r.outOfStock),
                "low" => filtered.Where(r => r.low),
                "ok" => filtered.Where(r => r.awaiting == 0 && !r.outOfStock && !r.low),
                _ => filtered.Where(r => r.awaiting > 0 || r.outOfStock || r.low)
            };

            var ordered = filtered
                // Сначала где ЖДУТ ключа (клиент заплатил), затем пустые, «мало», по остатку.
                .OrderByDescending(r => r.awaiting)
                .ThenBy(r => r.available)
                .ThenByDescending(r => r.delivered)
                .ThenBy(r => r.title, StringComparer.OrdinalIgnoreCase)
                .ToList();

            var size = Math.Clamp(pageSize, 5, 100);
            var pageIndex = Math.Max(1, page);
            var skip = (pageIndex - 1) * size;
            if (skip >= ordered.Count && ordered.Count > 0)
            {
                // Страница за концом списка — показываем последнюю, а не пустоту.
                pageIndex = (ordered.Count + size - 1) / size;
                skip = (pageIndex - 1) * size;
            }

            return Ok(new
            {
                totals,
                lowThreshold,
                status = (status ?? "attention").Trim().ToLowerInvariant(),
                query = needle,
                page = pageIndex,
                pageSize = size,
                total = ordered.Count,
                games = ordered.Skip(skip).Take(size)
            });
        }

        // Кто именно ждёт ключи: список позиций заказов с дефицитом (номер заказа, почта, игра, сколько ждут).
        [HttpGet("owed")]
        public async Task<IActionResult> Owed()
        {
            var lines = await _orders.GetOwedKeyOrdersAsync();
            // Названия — только для игр из списка ожидающих: он короткий, а каталог может быть
            // огромным, и читать его целиком ради нескольких заголовков незачем.
            var titleById = (await _games.GetByIdsAsync(
                    lines.Select(line => line.GameId).Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.OrdinalIgnoreCase)))
                .Where(g => !string.IsNullOrWhiteSpace(g.Id))
                .ToDictionary(g => g.Id!, g => string.IsNullOrWhiteSpace(g.Title) ? g.Name : g.Title, StringComparer.OrdinalIgnoreCase);

            var items = lines.Select(l => new
            {
                orderNumber = l.OrderNumber,
                buyerEmail = l.BuyerEmail,
                gameId = l.GameId,
                gameTitle = titleById.TryGetValue(l.GameId, out var t) ? t : l.GameId,
                remaining = l.Remaining,
                createdAt = l.CreatedAt
            }).ToList();

            return Ok(new { total = items.Sum(i => i.remaining), lines = items });
        }

        /// <summary>
        /// Склад: что кончается, что уже пусто и с какой скоростью уходит — по всему магазину.
        ///
        /// Считается так, чтобы стоимость не зависела от размера каталога. База отдаёт готовые
        /// итоги по областям активации и ограниченные срезы строк «игра × партия»; названия игр
        /// подтягиваются только для тех, что попадут на экран. Каталог целиком здесь больше не
        /// читается — на тридцати тысячах игр это была бы пересылка всего каталога на каждое
        /// открытие страницы ради двенадцати строк графика.
        ///
        /// «Кончились» — это не «никогда не было»: в ждущих пополнения только те игры, где такие
        /// ключи уже продавались или где магазин назначил цену за этот вариант, то есть сам
        /// объявил, что продаёт его.
        /// </summary>
        [HttpGet("overview/by-region")]
        public async Task<IActionResult> RegionOverview([FromQuery] int days = 30)
        {
            // Окно расхода: месяц по умолчанию, минимум неделя, максимум квартал. За день-два
            // «средний расход» — это шум, а за год он уже ничего не говорит о сегодняшнем спросе.
            var window = Math.Clamp(days, 7, 90);
            var since = DateTime.UtcNow.Date.AddDays(-(window - 1));
            var catalog = _regions.Current;

            // Единственные игры, чьи настройки влияют на разбор областей: со своей политикой или
            // с ценами за варианты. На любом каталоге их единицы.
            var regionGames = (await _games.GetWithRegionSettingsAsync())
                .Where(game => !string.IsNullOrWhiteSpace(game.Id))
                .ToDictionary(game => game.Id!, StringComparer.OrdinalIgnoreCase);

            var gamesWithOwnPolicy = regionGames.Values
                .Where(game => game.RegionPolicy is not null)
                .Select(game => game.Id!)
                .ToList();

            SuperBot.Core.Regions.RegionPolicy? GamePolicy(string gameId) =>
                regionGames.TryGetValue(gameId, out var game) ? game.RegionPolicy : null;

            string OfferKeyOf(SuperBot.Core.Regions.RegionPolicy? keyPolicy, string gameId) =>
                SuperBot.Core.Regions.RegionOffer.EffectiveKeyOf(keyPolicy, GamePolicy(gameId));

            var totals = await _gameKeyRepository.GetRegionTotalsAsync(gamesWithOwnPolicy);
            var usage = await _gameKeyRepository.GetKeyUsageAsync(since);

            // Два ограниченных среза: самые пустые (их пополняют) и те, что продавались за окно
            // (для прогноза). Быстрая игра с большим остатком в первый срез не попадает, поэтому
            // второй запрашивается отдельно — по списку игр из расхода.
            var emptiestRows = await _gameKeyRepository.GetRegionStockAsync(StockRowsLimit);
            var soldGameIds = usage.Select(row => row.GameId).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            var soldRows = await _gameKeyRepository.GetRegionStockForGamesAsync(soldGameIds);

            var stockRows = emptiestRows
                .Concat(soldRows)
                .GroupBy(row => (row.GameId, Offer: OfferKeyOf(row.Policy, row.GameId)))
                .Select(group => group.First())
                .Select(row => new
                {
                    row.GameId,
                    OfferKey = OfferKeyOf(row.Policy, row.GameId),
                    row.Policy,
                    row.Available,
                    row.Delivered
                })
                .ToList();

            var truncated = emptiestRows.Count >= StockRowsLimit;

            var dayLabels = Enumerable.Range(0, window).Select(offset => since.AddDays(offset)).ToList();

            var usageRows = usage
                .Select(row => new
                {
                    OfferKey = OfferKeyOf(row.Policy, row.GameId),
                    row.GameId,
                    row.Day,
                    row.Count
                })
                .ToList();

            var usageByGame = usageRows
                .GroupBy(row => (row.OfferKey, row.GameId))
                .ToDictionary(group => group.Key, group => group.Sum(row => row.Count));

            var dailyByGame = usageRows
                .GroupBy(row => (row.OfferKey, row.GameId))
                .ToDictionary(
                    group => group.Key,
                    group => (IReadOnlyDictionary<DateTime, int>)group
                        .GroupBy(row => row.Day)
                        .ToDictionary(g => g.Key, g => g.Sum(row => row.Count)));

            // Названия — только для игр, которые действительно окажутся на экране.
            var shownGameIds = stockRows.Select(row => row.GameId)
                .Concat(soldGameIds)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var titles = (await _games.GetByIdsAsync(shownGameIds))
                .Where(game => !string.IsNullOrWhiteSpace(game.Id))
                .ToDictionary(
                    game => game.Id!,
                    game => string.IsNullOrWhiteSpace(game.Title) ? (game.Name ?? game.Id!) : game.Title,
                    StringComparer.OrdinalIgnoreCase);

            string TitleOf(string gameId) => titles.TryGetValue(gameId, out var title) ? title : gameId;

            // Цена за вариант — заявка магазина «этот регион мы продаём». Пустой склад под неё
            // и есть то, что надо пополнить.
            var pricedOffers = regionGames.Values
                .Where(game => game.RegionPrices is { Count: > 0 })
                .SelectMany(game => game.RegionPrices!.Select(price => new
                {
                    GameId = game.Id!,
                    OfferKey = SuperBot.Core.Regions.RegionOffer.NormalizeKey(price.OfferKey, game.RegionPolicy)
                }))
                .ToList();

            // Итоги по областям: политика строки — своя у партии либо взятая у игры.
            var totalsByOffer = totals
                .GroupBy(row => SuperBot.Core.Regions.RegionOffer.EffectiveKeyOf(
                    row.Policy,
                    row.GameId is null ? null : GamePolicy(row.GameId)))
                .ToDictionary(
                    group => group.Key,
                    group => new
                    {
                        Policy = group.Select(row => row.Policy).FirstOrDefault(policy => policy is not null)
                            ?? group.Where(row => row.GameId is not null).Select(row => GamePolicy(row.GameId!)).FirstOrDefault(policy => policy is not null),
                        Available = group.Sum(row => row.Available),
                        Delivered = group.Sum(row => row.Delivered),
                        GamesInStock = group.Sum(row => row.GamesInStock)
                    },
                    StringComparer.OrdinalIgnoreCase);

            var offerKeys = totalsByOffer.Keys
                .Concat(pricedOffers.Select(offer => offer.OfferKey))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var byOffer = offerKeys
                .Select(offerKey =>
                {
                    totalsByOffer.TryGetValue(offerKey, out var total);

                    var policy = total?.Policy;
                    if (policy is null && SuperBot.Core.Regions.RegionOffer.TryParseKey(offerKey, out var parsed))
                    {
                        policy = parsed;
                    }

                    var summary = SuperBot.WebApi.Services.Regions.RegionSummary.Build(policy, catalog, null);
                    var available = total?.Available ?? 0;

                    var byDay = usageRows
                        .Where(row => string.Equals(row.OfferKey, offerKey, StringComparison.OrdinalIgnoreCase))
                        .GroupBy(row => row.Day)
                        .ToDictionary(group => group.Key, group => group.Sum(row => row.Count));

                    var daily = dayLabels.Select(day => byDay.TryGetValue(day, out var count) ? count : 0).ToList();
                    var (perDay, daysLeft, activeDays) = Forecast(byDay, dayLabels, available);

                    var priced = pricedOffers
                        .Where(offer => string.Equals(offer.OfferKey, offerKey, StringComparison.OrdinalIgnoreCase))
                        .Select(offer => offer.GameId)
                        .ToHashSet(StringComparer.OrdinalIgnoreCase);

                    var regionRows = stockRows
                        .Where(row => string.Equals(row.OfferKey, offerKey, StringComparison.OrdinalIgnoreCase))
                        .ToList();

                    var gameRows = regionRows
                        .Select(row =>
                        {
                            dailyByGame.TryGetValue((offerKey, row.GameId), out var gameByDay);
                            usageByGame.TryGetValue((offerKey, row.GameId), out var soldHere);
                            var (gamePerDay, gameDaysLeft, gameActiveDays) =
                                Forecast(gameByDay ?? new Dictionary<DateTime, int>(), dayLabels, row.Available);

                            return new
                            {
                                gameId = row.GameId,
                                title = TitleOf(row.GameId),
                                available = row.Available,
                                delivered = row.Delivered,
                                soldInWindow = soldHere,
                                perDay = gamePerDay,
                                daysLeft = gameDaysLeft,
                                activeDays = gameActiveDays
                            };
                        })
                        // Сверху то, что кончится раньше: сначала игры с прогнозом, потом по остатку.
                        .OrderBy(g => g.daysLeft ?? int.MaxValue)
                        .ThenBy(g => g.available)
                        .ThenByDescending(g => g.delivered)
                        .ThenBy(g => g.title, StringComparer.OrdinalIgnoreCase)
                        .ToList();

                    // Ждут пополнения: свободных ключей нет, а регион либо уже продавался, либо
                    // объявлен ценой — покупатель видит вариант на витрине.
                    var seen = gameRows.ToDictionary(g => g.gameId, StringComparer.OrdinalIgnoreCase);
                    var candidates = gameRows.Select(g => g.gameId).Concat(priced).Distinct(StringComparer.OrdinalIgnoreCase);

                    var needRestock = candidates
                        .Select(gameId =>
                        {
                            seen.TryGetValue(gameId, out var stats);
                            return new { gameId, available = stats?.available ?? 0, delivered = stats?.delivered ?? 0 };
                        })
                        .Where(g => g.available == 0 && (g.delivered > 0 || priced.Contains(g.gameId)))
                        .Select(g => new { gameId = g.gameId, title = TitleOf(g.gameId), delivered = g.delivered })
                        .OrderBy(g => g.title, StringComparer.OrdinalIgnoreCase)
                        .ToList();

                    return new
                    {
                        offerKey,
                        title = SuperBot.Core.Regions.RegionOffer.TitleOf(policy, catalog),
                        summary = summary.Summary,
                        exclusions = summary.Exclusions,
                        available,
                        delivered = total?.Delivered ?? 0,
                        gamesInStock = total?.GamesInStock ?? 0,
                        games = gameRows.Take(GamesPerRegionLimit),
                        // Срез ограничен — честно говорим об этом, вместо мнимого «всего N».
                        gamesTruncated = truncated || gameRows.Count > GamesPerRegionLimit,
                        gamesRunningOutSoon = gameRows.Count(g => g.daysLeft is not null && g.daysLeft <= RunningOutSoonDays),
                        needRestock,
                        daily,
                        soldInWindow = daily.Sum(),
                        perDay,
                        daysLeft,
                        activeDays
                    };
                })
                .OrderByDescending(row => row.needRestock.Count)
                .ThenBy(row => row.daysLeft ?? int.MaxValue)
                .ThenBy(row => row.available)
                .ToList();

            // Разрез по играм. Регион остаётся в подписи: одна и та же игра может лежать в двух
            // областях с разной судьбой — «Global» кончается, «EU» лежит.
            var gameSeries = stockRows
                .Select(row =>
                {
                    dailyByGame.TryGetValue((row.OfferKey, row.GameId), out var byDay);
                    usageByGame.TryGetValue((row.OfferKey, row.GameId), out var sold);
                    var (perDay, daysLeft, activeDays) =
                        Forecast(byDay ?? new Dictionary<DateTime, int>(), dayLabels, row.Available);

                    return new
                    {
                        gameId = row.GameId,
                        title = TitleOf(row.GameId),
                        row.OfferKey,
                        regionTitle = SuperBot.Core.Regions.RegionOffer.TitleOf(
                            row.Policy ?? GamePolicy(row.GameId),
                            catalog),
                        available = row.Available,
                        soldInWindow = sold,
                        perDay,
                        daysLeft,
                        activeDays,
                        delivered = row.Delivered,
                        priced = pricedOffers.Any(offer =>
                            string.Equals(offer.GameId, row.GameId, StringComparison.OrdinalIgnoreCase)
                            && string.Equals(offer.OfferKey, row.OfferKey, StringComparison.OrdinalIgnoreCase)),
                        daily = dayLabels.Select(day => byDay is not null && byDay.TryGetValue(day, out var count) ? count : 0).ToList()
                    };
                })
                .ToList();

            var runningOut = gameSeries
                .Where(row => row.daysLeft is not null)
                .OrderBy(row => row.daysLeft)
                .ThenByDescending(row => row.soldInWindow)
                .ToList();

            // Пустые — отдельным списком: у нуля нет «дней запаса», и на графике его не видно.
            // Сначала те, что продавались: у них спрос доказан, пополнять их нужнее.
            var outOfKeys = gameSeries
                .Where(row => row.available == 0)
                .OrderByDescending(row => row.delivered)
                .ThenByDescending(row => row.priced)
                .ThenBy(row => row.title, StringComparer.OrdinalIgnoreCase)
                .ToList();

            var totalDaily = dayLabels
                .Select(day => usageRows.Where(row => row.Day == day).Sum(row => row.Count))
                .ToList();

            return Ok(new
            {
                lowThreshold = _stock.LowStockThreshold,
                soonDays = RunningOutSoonDays,
                windowDays = window,
                days = dayLabels.Select(day => day.ToString("yyyy-MM-dd")),
                regions = byOffer,
                games = runningOut.Take(ChartGamesLimit),
                gamesTotal = runningOut.Count,
                outOfKeys = outOfKeys.Take(ChartGamesLimit * 2),
                outOfKeysTotal = outOfKeys.Count,
                // Срезы ограничены: на большом складе отчёт показывает верхушку, а не весь каталог.
                truncated,
                totalDaily
            });
        }

        // Счётчики пула по игре: сколько доступно (не выдано) и сколько выдано.
        [HttpGet("inventory/{gameId}")]
        public async Task<IActionResult> GetInventory(string gameId)
        {
            var available = await _gameKeyRepository.CountAvailableByGameAsync(gameId);
            var assigned = await _gameKeyRepository.CountAssignedByGameAsync(gameId);
            // Остаток по изданиям: пустой код — базовое. Нужен админу, чтобы видеть, что Deluxe кончился, пока Standard ещё есть.
            var byEdition = await _gameKeyRepository.CountAvailableByEditionAsync(gameId);
            // …и по политикам активации: партия «EU only» и партия «Global −RU» — разные запасы.
            var byRegion = await _gameKeyRepository.CountAvailableByRegionPolicyAsync(gameId);
            var game = await _games.GetByIdAsync(gameId);
            return Ok(new
            {
                gameId,
                available,
                assigned,
                byEdition = byEdition.Select(pair => new { editionCode = pair.Key, available = pair.Value }),
                byRegion = byRegion.Select(stat => new { summary = stat.Summary, policy = stat.Policy, editionCode = stat.EditionCode, available = stat.Available }),
                regionPolicy = game?.RegionPolicy
            });
        }

        // Список/поиск ключей игры (B): пагинация, фильтр статуса, поиск по подстроке ключа/email покупателя.
        // Выданные ключи маскируются (last-4) — см. GameKeyListItem.
        [HttpGet("inventory/{gameId}/list")]
        public async Task<IActionResult> ListKeys(
            string gameId,
            [FromQuery] string? query,
            [FromQuery] string? status,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 25)
        {
            var result = await _gameKeyRepository.GetKeysPagedAsync(gameId, query, status, page, pageSize);
            return Ok(new { items = result.Items, total = result.Total, page, pageSize });
        }

        // Залить ключи в пул игры (B). Тело: { keyType, keys: [...] }.
        [HttpPost("inventory/{gameId}")]
        public async Task<IActionResult> AddToInventory(string gameId, [FromBody] AddPoolKeysRequest request)
        {
            if (request?.Keys == null || request.Keys.Count == 0)
            {
                return BadRequest(new { message = "The key list is empty." });
            }

            var (cost, costError) = BuildBatchCost(request.UnitCost, request.CostCurrency, request.Supplier);
            if (costError is not null)
            {
                return BadRequest(new { message = costError });
            }

            // Дубли/повторы (по хешу, в рамках игры) не заливаются повторно — вернём счётчики админке.
            var addResult = await _gameKeyRepository.AddPoolKeysAsync(gameId, request.KeyType, request.Keys, Actor(), request.EditionCode, request.RegionPolicy, cost);
            StockChanged();

            // Цена продажи региона живёт у игры, а не у ключа: ключей в партии сотни, и цена,
            // размазанная по ним, рассыпалась бы на разные значения после первой же дозаливки.
            if (request.SalePrice is > 0)
            {
                await SetRegionPriceAsync(gameId, request.RegionPolicy, request.EditionCode, request.SalePrice.Value);
            }

            // Довыдаём ключи по оплаченным заказам, ждавшим пополнения пула — только если реально что-то добавили.
            // (Гостей с неподтверждённой почтой выдача пропустит сама — гейт внутри.)
            var backfilled = addResult.Added > 0
                ? await _fulfillment.BackfillGameAsync(gameId)
                : (IReadOnlyList<SuperBot.Core.Interfaces.OrderKeysDelivered>)System.Array.Empty<SuperBot.Core.Interfaces.OrderKeysDelivered>();

            // Раньше бэкфилл раздавал ключи МОЛЧА: заказ закрывался, а покупатель (особенно гость,
            // у которого нет кабинета) об этом не узнавал. Теперь ключи уходят письмом.
            foreach (var delivery in backfilled)
            {
                if (!delivery.Order.UserId.Contains('@') || delivery.Keys.Count == 0)
                {
                    continue;
                }

                try
                {
                    await _deliveryMailer.SendGameKeysAsync(
                        delivery.Order.UserId,
                        delivery.Order.OrderNumber ?? delivery.Order.Id.ToString(),
                        delivery.Keys,
                        SuperBot.Core.Interfaces.KeyDeliveryReceipt.FromOrder(delivery.Order),
                        SuperBot.Core.Interfaces.KeyDeliveryProgress.FromOrder(delivery.Order),
                        locale: delivery.Order.Language);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Backfill keys email failed for order {OrderId} ({Email}).",
                        delivery.Order.Id, delivery.Order.UserId);
                }
            }

            var available = await _gameKeyRepository.CountAvailableByGameAsync(gameId);
            return Ok(new
            {
                gameId,
                added = addResult.Added,
                skippedDuplicates = addResult.SkippedDuplicates,
                previouslyVoided = addResult.PreviouslyVoided,
                available,
                backfilledOrders = backfilled.Count
            });
        }

        // Мягко изъять пуловый ключ (опечатка/мусор): уходит из пула, остаётся в истории, plaintext стирается.
        [HttpPost("inventory/{gameId}/keys/{keyId}/void")]
        public async Task<IActionResult> VoidKey(string gameId, string keyId)
        {
            var ok = await _gameKeyRepository.VoidPoolKeyAsync(gameId, keyId);
            StockChanged();
            return ok ? Ok(new { voided = true }) : NotFound(new { message = "Key not found, or it is not in the pool." });
        }

        // Жёстко удалить пуловый/изъятый ключ — освобождает значение для повторной заливки. Выданные не трогает.
        [HttpDelete("inventory/{gameId}/keys/{keyId}")]
        public async Task<IActionResult> PurgeKey(string gameId, string keyId)
        {
            var ok = await _gameKeyRepository.PurgeKeyAsync(gameId, keyId);
            StockChanged();
            return ok ? Ok(new { purged = true }) : NotFound(new { message = "Key not found, or it has already been issued." });
        }

        // Править пуловый ключ (значение и/или тип). Тело: { key?, keyType? }.
        [HttpPut("inventory/{gameId}/keys/{keyId}")]
        public async Task<IActionResult> EditKey(string gameId, string keyId, [FromBody] EditKeyRequest request)
        {
            var outcome = await _gameKeyRepository.EditPoolKeyAsync(gameId, keyId, request?.Key, request?.KeyType);
            return outcome switch
            {
                EditKeyOutcome.Ok => Ok(new { edited = true }),
                EditKeyOutcome.DuplicateActive => Conflict(new { message = "This key is already active for this game." }),
                _ => NotFound(new { message = "Key not found, or it cannot be edited (issued or voided)." })
            };
        }

        // Выдать ключ пользователю (тест/поддержка) — через ту же логику dispense (B→A).
        [HttpPost("grant")]
        public async Task<IActionResult> Grant([FromBody] GrantKeyRequest request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.GameId) || string.IsNullOrWhiteSpace(request.UserId))
            {
                return BadRequest(new { message = "gameId and userId are required." });
            }

            var key = await _fulfillment.DispenseAsync(request.GameId, request.UserId, request.KeyType, Actor());
            StockChanged();
            if (key == null)
            {
                return Ok(new { granted = false, message = "Нет доступного ключа (пул пуст)." });
            }

            return Ok(new { granted = true, key = key.Key, keyType = key.KeyType });
        }
        // Импорт из файла/буфера с предпросмотром. Тело — текст как есть: по ключу в строке, либо
        // CSV/TSV, где первая колонка — ключ, вторая (необязательно) — тип. Заголовок вроде
        // «key,type» распознаётся и пропускается. dryRun=true — только отчёт, ничего не пишется.
        [HttpPost("inventory/{gameId}/import")]
        public async Task<IActionResult> Import(string gameId, [FromBody] ImportKeysRequest request)
        {
            if (request is null || string.IsNullOrWhiteSpace(request.Content))
            {
                return BadRequest(new { message = "Файл пуст." });
            }

            var parsed = KeyImportParser.Parse(request.Content, request.KeyType);
            var byType = parsed.Keys.GroupBy(k => k.KeyType).ToList();

            if (parsed.Keys.Count == 0 || request.DryRun)
            {
                var preview = parsed.Keys.Count == 0
                    ? new SuperBot.Core.Interfaces.IRepositories.AddPoolKeysResult(0, 0, 0)
                    : await _gameKeyRepository.PreviewPoolKeysAsync(gameId, parsed.Keys.Select(k => k.Key));
                return Ok(ImportReport(true, parsed, byType, preview.Added, preview.SkippedDuplicates, preview.PreviouslyVoided, 0, 0));
            }

            var (cost, costError) = BuildBatchCost(request.UnitCost, request.CostCurrency, request.Supplier);
            if (costError is not null)
            {
                return BadRequest(new { message = costError });
            }

            var actor = Actor();
            int added = 0, duplicates = 0, voided = 0;
            // Себестоимость считается ОДИН раз до цикла: ключи разных типов из одного файла — это
            // одна закупка, и BatchId у них должен совпадать, иначе партия распадётся в отчёте.
            foreach (var group in byType)
            {
                var result = await _gameKeyRepository.AddPoolKeysAsync(gameId, group.Key, group.Select(k => k.Key), actor, request.EditionCode, request.RegionPolicy, cost);
                StockChanged();
                added += result.Added;
                duplicates += result.SkippedDuplicates;
                voided += result.PreviouslyVoided;
            }

            var backfilled = added > 0 ? await BackfillAndMailAsync(gameId) : 0;
            return Ok(ImportReport(false, parsed, byType, added, duplicates, voided, added, backfilled));
        }

        private static object ImportReport(bool dryRun, KeyImportParser.ParseResult parsed, IEnumerable<IGrouping<string, KeyImportParser.ParsedKey>> byType,
            int wouldAdd, int duplicates, int previouslyVoided, int added, int backfilledOrders) => new
        {
            dryRun,
            lines = parsed.TotalLines,
            parsed = parsed.Keys.Count,
            invalid = parsed.Invalid.Count,
            invalidSamples = parsed.Invalid.Take(5),
            types = byType.Select(g => new { keyType = g.Key, count = g.Count() }),
            wouldAdd,
            duplicates,
            previouslyVoided,
            added,
            backfilledOrders
        };

        /// <summary>
        /// Что осталось без закупочной цены — сгруппировано так, как заливалось.
        /// Названия игр подставляем здесь: репозиторий ключей о каталоге ничего не знает.
        /// </summary>
        [HttpGet("cost-backfill")]
        public async Task<IActionResult> CostBackfillGroups()
        {
            var groups = await _gameKeyRepository.ListKeysWithoutCostAsync();
            var titles = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var gameId in groups.Select(g => g.GameId).Distinct(StringComparer.OrdinalIgnoreCase))
            {
                var game = await _games.GetByIdAsync(gameId);
                if (game is not null)
                {
                    titles[gameId] = string.IsNullOrWhiteSpace(game.Title) ? game.Name : game.Title;
                }
            }

            return Ok(new
            {
                totalKeys = groups.Sum(g => g.Keys),
                groups = groups.Select(g => new
                {
                    g.GameId,
                    title = titles.TryGetValue(g.GameId, out var title) ? title : null,
                    // Игру могли удалить, а ключи остались: показать «нет в каталоге» честнее,
                    // чем спрятать группу и оставить её вечно без цены.
                    inCatalog = titles.ContainsKey(g.GameId),
                    g.BatchId,
                    uploadedOn = g.UploadedOn,
                    g.KeyType,
                    g.EditionCode,
                    g.Keys,
                    g.InPool,
                    g.Delivered,
                    g.Voided
                })
            });
        }

        /// <summary>
        /// Проставить закупочную цену ключам, у которых её нет. dryRun — только посчитать.
        /// Уже заполненные цены не трогаются никогда.
        /// </summary>
        [HttpPost("cost-backfill")]
        public async Task<IActionResult> CostBackfill([FromBody] CostBackfillRequest request)
        {
            if (request is null || string.IsNullOrWhiteSpace(request.GameId))
            {
                return BadRequest(new { message = "Game is required." });
            }
            var (cost, costError) = BuildBatchCost(request.UnitCost, request.CostCurrency, request.Supplier);
            if (costError is not null)
            {
                return BadRequest(new { message = costError });
            }
            if (cost is null)
            {
                return BadRequest(new { message = "Purchase price is required." });
            }
            if (request.Limit is <= 0)
            {
                return BadRequest(new { message = "Limit must be a positive number." });
            }

            var target = new KeyCostBackfillTarget(
                request.GameId,
                string.IsNullOrWhiteSpace(request.BatchId) ? null : request.BatchId,
                request.UploadedOn,
                string.IsNullOrWhiteSpace(request.KeyType) ? null : request.KeyType,
                string.IsNullOrWhiteSpace(request.EditionCode) ? null : request.EditionCode,
                request.Limit);

            var result = await _gameKeyRepository.BackfillCostAsync(target, cost, request.DryRun);
            return Ok(new { result.Matched, result.Updated, result.DryRun, unitCost = cost.UnitCost, currency = cost.Currency });
        }

        /// <summary>
        /// Себестоимость партии из запроса. null без ошибки — цену не указали, ключи заводятся
        /// без неё: заливка не должна вставать из-за того, что закупочную цену ещё не знают.
        /// </summary>
        private (KeyBatchCost? Cost, string? Error) BuildBatchCost(decimal? unitCost, string? currency, string? supplier)
        {
            if (unitCost is null)
            {
                return (null, null);
            }
            if (unitCost < 0)
            {
                return (null, "Purchase price cannot be negative.");
            }

            // Валюта не указана — базовая валюта магазина: чаще всего закупка и продажа в ней же.
            var code = string.IsNullOrWhiteSpace(currency) ? _currencies.Base : currency.Trim().ToUpperInvariant();
            var cleanSupplier = string.IsNullOrWhiteSpace(supplier) ? null : supplier.Trim();
            return (new KeyBatchCost(unitCost.Value, code, cleanSupplier, Guid.NewGuid().ToString("N")), null);
        }

        /// <summary>Политика активации игры по умолчанию (для ключей без своей). null — везде.</summary>
        [HttpPut("inventory/{gameId}/region-policy")]
        /// <summary>
        /// Цена продажи регионального варианта. Пустая цена снимает её — вариант возвращается
        /// к цене игры. Регион задаётся политикой, как и при заливке партии: одинаково
        /// названный вариант должен получаться из одинакового описания.
        /// </summary>
        [HttpPut("inventory/{gameId}/region-price")]
        public async Task<IActionResult> SetRegionPrice(string gameId, [FromBody] RegionPriceRequest request)
        {
            var game = await _games.GetByIdAsync(gameId);
            if (game is null)
            {
                return NotFound(new { message = "Игра не найдена." });
            }
            if (request?.Price is < 0)
            {
                return BadRequest(new { message = "Цена не может быть отрицательной." });
            }

            await SetRegionPriceAsync(gameId, request?.RegionPolicy, request?.EditionCode, request?.Price);
            var updated = await _games.GetByIdAsync(gameId);
            return Ok(new { gameId, regionPrices = updated?.RegionPrices });
        }

        /// <summary>
        /// Запись цены варианта у игры: одна цена на (регион + издание), повторное назначение
        /// перезаписывает прежнюю. Пустая цена удаляет запись — это и есть «продавать как игру».
        /// </summary>
        private async Task SetRegionPriceAsync(
            string gameId,
            SuperBot.Core.Regions.RegionPolicy? policy,
            string? editionCode,
            decimal? price)
        {
            var game = await _games.GetByIdAsync(gameId);
            if (game is null)
            {
                return;
            }

            var offerKey = SuperBot.Core.Regions.RegionOffer.KeyOf(policy);
            var edition = string.IsNullOrWhiteSpace(editionCode) ? null : editionCode.Trim();
            var prices = game.RegionPrices ?? new List<SuperBot.Core.Regions.RegionPrice>();

            prices.RemoveAll(item =>
                string.Equals(item.OfferKey, offerKey, StringComparison.OrdinalIgnoreCase)
                && string.Equals(item.EditionCode ?? string.Empty, edition ?? string.Empty, StringComparison.OrdinalIgnoreCase));

            if (price is > 0)
            {
                prices.Add(new SuperBot.Core.Regions.RegionPrice
                {
                    OfferKey = offerKey,
                    EditionCode = edition,
                    Price = price.Value
                });
            }

            game.RegionPrices = prices.Count > 0 ? prices : null;
            await _games.UpdateAsync(gameId, game);
            StockChanged();
        }

        public async Task<IActionResult> SetRegionPolicy(string gameId, [FromBody] SuperBot.Core.Regions.RegionPolicy? policy)
        {
            var game = await _games.GetByIdAsync(gameId);
            if (game is null)
            {
                return NotFound();
            }
            var normalized = policy?.Normalize();
            if (normalized is not null && !normalized.IsGlobal && normalized.Regions.Count == 0)
            {
                return BadRequest(new { message = "Choose at least one region, or switch the policy to Global." });
            }
            game.RegionPolicy = normalized is { IsGlobal: true, ExcludedCountries.Count: 0 } ? null : normalized;
            await _games.UpdateAsync(gameId, game);
            StockChanged();
            return Ok(new { gameId, regionPolicy = game.RegionPolicy });
        }

        // Порог «мало ключей» для конкретной игры. null — вернуться к общему.
        [HttpPut("inventory/{gameId}/threshold")]
        public async Task<IActionResult> SetThreshold(string gameId, [FromBody] SetThresholdRequest request)
        {
            var game = await _games.GetByIdAsync(gameId);
            if (game is null)
            {
                return NotFound();
            }
            if (request?.LowStockThreshold is < 0)
            {
                return BadRequest(new { message = "Порог не может быть отрицательным." });
            }

            game.LowStockThreshold = request?.LowStockThreshold;
            // Дата «скоро закончится» — ручной ажиотаж: с неё витрина показывает «Selling fast» при любом остатке.
            game.LowStockFromUtc = request?.LowStockFromUtc;
            await _games.UpdateAsync(gameId, game);
            StockChanged();
            return Ok(new { gameId, lowStockThreshold = game.LowStockThreshold, lowStockFromUtc = game.LowStockFromUtc, defaultThreshold = _stock.LowStockThreshold });
        }

        private string Actor() =>
            User.FindFirst("email")?.Value
            ?? User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value
            ?? User.Identity?.Name
            ?? "admin";

        // Довыдача по заказам, ждавшим ключей, плюс письма покупателям — то же, что делает
        // AddToInventory после заливки; вынесено, чтобы импорт вёл себя одинаково.
        private async Task<int> BackfillAndMailAsync(string gameId)
        {
            var backfilled = await _fulfillment.BackfillGameAsync(gameId);
            foreach (var delivery in backfilled)
            {
                if (!delivery.Order.UserId.Contains('@') || delivery.Keys.Count == 0)
                {
                    continue;
                }
                try
                {
                    await _deliveryMailer.SendGameKeysAsync(
                        delivery.Order.UserId,
                        delivery.Order.OrderNumber ?? delivery.Order.Id.ToString(),
                        delivery.Keys,
                        SuperBot.Core.Interfaces.KeyDeliveryReceipt.FromOrder(delivery.Order),
                        SuperBot.Core.Interfaces.KeyDeliveryProgress.FromOrder(delivery.Order),
                        locale: delivery.Order.Language);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Backfill keys email failed for order {OrderId} ({Email}).", delivery.Order.Id, delivery.Order.UserId);
                }
            }
            return backfilled.Count;
        }
    }

    public class ImportKeysRequest
    {
        public string Content { get; set; } = string.Empty;
        /// <summary>Издание, к которому относятся ключи файла; пусто — базовое.</summary>
        public string? EditionCode { get; set; }
        /// <summary>Политика активации партии; пусто — политика игры.</summary>
        public SuperBot.Core.Regions.RegionPolicy? RegionPolicy { get; set; }
        /// <summary>Тип по умолчанию для строк без второй колонки.</summary>
        public string KeyType { get; set; } = "CD Key";
        /// <summary>Цена закупки одного ключа. Пусто — себестоимость неизвестна, ключи заводятся без неё.</summary>
        public decimal? UnitCost { get; set; }
        /// <summary>Валюта закупки. Пусто при указанной цене — базовая валюта магазина.</summary>
        public string? CostCurrency { get; set; }
        public string? Supplier { get; set; }
        public bool DryRun { get; set; } = true;
    }

    /// <summary>
    /// Проставление цены задним числом. Limit — сколько ключей группы взять по порядку
    /// заведения: им и решается случай «часть партии куплена дороже».
    /// </summary>
    public class CostBackfillRequest
    {
        public string GameId { get; set; } = string.Empty;
        public string? BatchId { get; set; }
        public DateTime? UploadedOn { get; set; }
        public string? KeyType { get; set; }
        public string? EditionCode { get; set; }
        public decimal? UnitCost { get; set; }
        public string? CostCurrency { get; set; }
        public string? Supplier { get; set; }
        public int? Limit { get; set; }
        public bool DryRun { get; set; } = true;
    }

    public class SetThresholdRequest
    {
        public int? LowStockThreshold { get; set; }
        public DateTime? LowStockFromUtc { get; set; }
    }

    /// <summary>
    /// Разбор текста импорта ключей. Правила намеренно простые и предсказуемые: по ключу в
    /// строке; разделители , ; или табуляция — первая колонка ключ, вторая тип; строки с # —
    /// комментарии; заголовок вида «key» распознаётся по отсутствию цифр и слову key.
    /// </summary>
    public static class KeyImportParser
    {
        public sealed record ParsedKey(string Key, string KeyType);
        public sealed record ParseResult(List<ParsedKey> Keys, List<string> Invalid, int TotalLines);

        private static readonly char[] Separators = { ',', ';', '\t' };
        private const int MinKeyLength = 5;

        public static ParseResult Parse(string content, string defaultType)
        {
            var type = string.IsNullOrWhiteSpace(defaultType) ? "CD Key" : defaultType.Trim();
            var keys = new List<ParsedKey>();
            var invalid = new List<string>();
            var lines = content.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
            var total = 0;
            var firstContentLine = Array.FindIndex(lines, l => l.Trim().TrimStart('﻿').Length > 0);

            for (var i = 0; i < lines.Length; i++)
            {
                var raw = lines[i].Trim().TrimStart('﻿');
                if (raw.Length == 0 || raw.StartsWith('#'))
                {
                    continue;
                }

                string key, keyType = type;
                var sep = raw.IndexOfAny(Separators);
                if (sep >= 0)
                {
                    key = raw[..sep].Trim().Trim('"');
                    var second = raw[(sep + 1)..].Split(Separators, 2)[0].Trim().Trim('"');
                    if (second.Length > 0)
                    {
                        keyType = second;
                    }
                }
                else
                {
                    key = raw.Trim('"');
                }

                // Заголовок CSV: первая непустая строка, в ключе слово «key» и нет цифр.
                if (i == firstContentLine && key.Contains("key", StringComparison.OrdinalIgnoreCase) && !key.Any(char.IsDigit))
                {
                    continue;
                }

                total++;
                if (key.Length < MinKeyLength || key.Any(char.IsWhiteSpace))
                {
                    invalid.Add(raw.Length > 60 ? raw[..60] + "…" : raw);
                    continue;
                }

                keys.Add(new ParsedKey(key, keyType));
            }

            return new ParseResult(keys, invalid, total);
        }
    }

    public class AddPoolKeysRequest
    {
        public string KeyType { get; set; } = "CD Key";
        public string? EditionCode { get; set; }
        public SuperBot.Core.Regions.RegionPolicy? RegionPolicy { get; set; }
        public decimal? UnitCost { get; set; }
        public string? CostCurrency { get; set; }
        public string? Supplier { get; set; }

        /// <summary>
        /// Цена ПРОДАЖИ ключей этого региона, в базовой валюте игры. Пусто — регион продаётся
        /// по цене игры. Не путать с UnitCost: та — сколько магазин заплатил поставщику.
        /// </summary>
        public decimal? SalePrice { get; set; }

        public List<string> Keys { get; set; } = new();
    }

    /// <summary>Цена продажи регионального варианта: регион + издание + сумма.</summary>
    public class RegionPriceRequest
    {
        public SuperBot.Core.Regions.RegionPolicy? RegionPolicy { get; set; }
        public string? EditionCode { get; set; }
        /// <summary>Пусто или ноль — снять цену, продавать по цене игры.</summary>
        public decimal? Price { get; set; }
    }

    public class EditKeyRequest
    {
        public string? Key { get; set; }
        public string? KeyType { get; set; }
    }

    public class GrantKeyRequest
    {
        public string GameId { get; set; } = string.Empty;
        public string UserId { get; set; } = string.Empty;
        public string? KeyType { get; set; }
    }
}
