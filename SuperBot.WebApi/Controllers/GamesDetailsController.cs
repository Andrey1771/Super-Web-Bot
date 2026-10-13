using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Common.Auth;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Services;
using System.Text;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/games")]
public class GamesDetailsController : ControllerBase
{
    private readonly IGameRepository _gameRepository;
    private readonly IGameDetailsRepository _gameDetailsRepository;
    private readonly IGameReviewRepository _gameReviewRepository;
    private readonly IWishlistRepository _wishlistRepository;
    private readonly IOrderRepository _orderRepository;
    private readonly IGameDiscountRepository _gameDiscountRepository;
    private readonly IGameKeyRepository _gameKeyRepository;
    private readonly SuperBot.Core.Payments.StorefrontCurrencyOptions _currencies;
    private readonly SuperBot.Infrastructure.Services.IFxRateService _fxRates;
    private readonly SuperBot.Core.Payments.FxOptions _fx;
    private readonly SuperBot.WebApi.Services.SiteSettings.StockOptions _stock;
    private readonly SuperBot.Core.Regions.IRegionCatalogProvider _regions;
    /// <summary>Снимок каталога — для DLC и «похожих»: в нём уже есть родитель, вид, жанры, скидка и оценка каждой позиции.</summary>
    private readonly ICatalogSnapshotService _catalogSnapshot;

    public GamesDetailsController(
        IGameRepository gameRepository,
        IGameDetailsRepository gameDetailsRepository,
        IGameReviewRepository gameReviewRepository,
        IWishlistRepository wishlistRepository,
        IOrderRepository orderRepository,
        IGameDiscountRepository gameDiscountRepository,
        IGameKeyRepository gameKeyRepository,
        Microsoft.Extensions.Options.IOptions<SuperBot.Core.Payments.StorefrontCurrencyOptions> currencies,
        SuperBot.Infrastructure.Services.IFxRateService fxRates,
        Microsoft.Extensions.Options.IOptionsSnapshot<SuperBot.Core.Payments.FxOptions> fx,
        Microsoft.Extensions.Options.IOptionsSnapshot<SuperBot.WebApi.Services.SiteSettings.StockOptions> stock,
        SuperBot.Core.Regions.IRegionCatalogProvider regions,
        ICatalogSnapshotService catalogSnapshot)
    {
        _stock = stock.Value;
        _regions = regions;
        _catalogSnapshot = catalogSnapshot;
        _gameRepository = gameRepository;
        _gameDetailsRepository = gameDetailsRepository;
        _gameReviewRepository = gameReviewRepository;
        _wishlistRepository = wishlistRepository;
        _orderRepository = orderRepository;
        _gameDiscountRepository = gameDiscountRepository;
        _gameKeyRepository = gameKeyRepository;
        _currencies = currencies.Value;
        _fxRates = fxRates;
        _fx = fx.Value;
    }

    [HttpGet("{slug}")]
    public async Task<IActionResult> GetGameBySlug(string slug, [FromQuery] string? currency = null)
    {
        if (string.IsNullOrWhiteSpace(slug))
        {
            return BadRequest("Slug is required.");
        }

        var normalizedSlug = NormalizeSlug(slug);
        var details = await _gameDetailsRepository.GetBySlugAsync(normalizedSlug);
        if (details == null && normalizedSlug != slug)
        {
            details = await _gameDetailsRepository.GetBySlugAsync(slug);
        }
        if (details == null)
        {
            var game = await _gameRepository.GetBySlugAsync(normalizedSlug)
                ?? (normalizedSlug != slug ? await _gameRepository.GetBySlugAsync(slug) : null)
                ?? await FindGameByIdentifierAsync(slug, normalizedSlug);
            if (game == null)
            {
                return NotFound();
            }

            // Игра нашлась по названию или id, а не по адресу карточки: сначала её собственная карточка (у неё
            // может быть другой slug, заданный админом), и только если карточки нет вовсе — заготовка в памяти.
            // Раньше заготовка записывалась в базу поверх настоящей карточки: ссылка, собранная из названия
            // (корзина, старые письма), стирала описание и лицензии, которые заполнил админ.
            details = (string.IsNullOrWhiteSpace(game.Id) ? null : await _gameDetailsRepository.GetByGameIdAsync(game.Id))
                ?? BuildDefaultDetails(game, await HttpContext.RequestServices.GetRequiredService<SuperBot.WebApi.Services.IGameGenreDirectory>().GetAsync());
        }

        // Черновик недоступен и по прямой ссылке, а не только скрыт из каталога: иначе адрес,
        // случайно ушедший в переписку или проиндексированный, показывал бы недоделанную карточку.
        if (details.IsDraft)
        {
            return NotFound();
        }

        var summary = await _gameReviewRepository.GetSummaryAsync(details.GameId);
        details.RatingAvg = summary.Average;
        details.ReviewsCount = summary.Count;

        // Продаваемость определяет Game.ReleaseDate (единый источник истины, см. GameRelease) —
        // ReleaseDate внутри GameDetails чисто витринный и на статус не влияет.
        var linkedGame = string.IsNullOrWhiteSpace(details.GameId)
            ? null
            : await _gameRepository.GetByIdAsync(details.GameId);

        // Цена — в валюте покупателя, тем же путём, что и каталог: ручная цена из прайс-листа
        // игры, иначе пересчёт по курсу с наценкой и округлением. Раньше карточка отдавала
        // базовую цену, а фронт подставлял к ней символ выбранной валюты — $30 превращались в €30.
        var resolvedCurrency = _currencies.Resolve(currency);
        var isComingSoon = linkedGame != null &&
            SuperBot.Core.Services.GameRelease.IsUpcoming(linkedGame.ReleaseDate, DateTime.UtcNow);

        // Скидка — из того же места, что у каталога, корзины и чекаута: GameDiscount со сроком действия.
        // Раньше карточка брала GameDetails.DiscountPercent — отдельное поле без срока, и страница могла
        // обещать −30%, которых чекаут не знал. На невышедшую игру скидка гасится, как везде.
        var discountRecord = string.IsNullOrWhiteSpace(details.GameId) ? null : await _gameDiscountRepository.GetByGameIdAsync(details.GameId);
        var discount = !isComingSoon && discountRecord is not null && discountRecord.IsActiveAt(DateTime.UtcNow)
            ? new ActiveDiscount(discountRecord.DiscountPercent, discountRecord.EndDate)
            : null;

        var pricing = BuildPricing(details, linkedGame, resolvedCurrency, discount);

        // Цены изданий — в той же валюте и по тем же правилам (ручная → курс → нет). Отдаём
        // отдельной картой по коду издания: сама сущность details уходит как есть, и у её изданий
        // Price — в базовой валюте, им на фронте пользоваться нельзя.
        var editionPricing = BuildEditionPricing(details, linkedGame, resolvedCurrency, discount);

        var availability = await BuildAvailabilityAsync(linkedGame, isComingSoon);
        var editionAvailability = await BuildEditionAvailabilityAsync(details, linkedGame, isComingSoon);
        // Покупки посетителя — один запрос заказов на страницу: по ним и форма отзыва, и отметка «уже есть» у DLC.
        var purchased = await LoadPurchasedAsync();
        var dlc = await BuildDlcAsync(details.GameId, resolvedCurrency, purchased);
        var parentGame = await BuildParentGameAsync(linkedGame);
        var buyerCountryForRegions = SuperBot.WebApi.Services.Regions.BuyerCountry.Resolve(Request);
        var regionInfo = await BuildRegionInfoAsync(linkedGame, buyerCountryForRegions);
        var regionOffers = await BuildRegionOffersAsync(linkedGame, buyerCountryForRegions, resolvedCurrency);

        var recommendations = new
        {
            moreLikeThis = await BuildRecommendations(details, resolvedCurrency)
        };

        var userContext = await BuildUserContext(details.GameId, purchased);

        // Тексты карточки — на языке покупателя; объект per-request, админка читает своим маршрутом.
        var buyerLanguage = SuperBot.WebApi.Services.BuyerLanguage.Resolve(Request);
        SuperBot.WebApi.Services.Storefront.GameDetailsLocalizer.Apply(details, buyerLanguage);

        return Ok(new
        {
            game = details,
            // Подписи жанров и тегов на языке покупателя; значения в game остаются английскими — по ним строятся ссылки и фильтры.
            genreLabels = SuperBot.WebApi.Services.Storefront.GameDetailsLocalizer.GenreLabels(details, buyerLanguage),
            tagLabels = SuperBot.WebApi.Services.Storefront.GameDetailsLocalizer.TagLabels(details, buyerLanguage),
            // Игра или ПО: от вида зависит страница (блоки, подписи, инструкция активации). Лицензии ПО — в изданиях.
            kind = (linkedGame?.Kind ?? ProductKind.Game).ToString(),
            softwareCategory = linkedGame?.Kind == ProductKind.Software ? linkedGame.SoftwareCategory : null,
            isComingSoon,
            pricing,
            editionPricing,
            availability,
            editionAvailability,
            dlc,
            parentGame,
            regionInfo,
            regionOffers,
            ratingSummary = new
            {
                avg = summary.Average,
                count = summary.Count,
                distribution = summary.Distribution,
                recommendPercent = summary.Count > 0 ? (int)Math.Round(100.0 * summary.RecommendCount / summary.Count) : (int?)null
            },
            recommendations,
            userContext
        });
    }

    private async Task<Game?> FindGameByIdentifierAsync(string slug, string normalizedSlug)
    {
        var games = await _gameRepository.GetAllAsync();
        return games.FirstOrDefault(candidate =>
            candidate != null &&
            (
                string.Equals(candidate.Id, slug, StringComparison.OrdinalIgnoreCase)
                || NormalizeSlug(candidate.Slug) == normalizedSlug
                || NormalizeSlug(candidate.Title ?? candidate.Name) == normalizedSlug
            ));
    }

    [HttpGet("{slug}/recommendations")]
    public async Task<IActionResult> GetRecommendations(string slug, [FromQuery] int limit = 8, [FromQuery] string? currency = null)
    {
        var normalizedSlug = NormalizeSlug(slug);
        var details = await _gameDetailsRepository.GetBySlugAsync(normalizedSlug);
        if (details == null && normalizedSlug != slug)
        {
            details = await _gameDetailsRepository.GetBySlugAsync(slug);
        }
        if (details == null)
        {
            return NotFound();
        }

        var recommendations = await BuildRecommendations(details, _currencies.Resolve(currency), limit);
        return Ok(new { items = recommendations });
    }

    private GameDetails BuildDefaultDetails(Game game, IReadOnlyList<GameCategory> genres)
    {
        return new GameDetails
        {
            GameId = game.Id,
            Slug = string.IsNullOrWhiteSpace(game.Slug)
                ? NormalizeSlug(game.Title ?? game.Name)
                : NormalizeSlug(game.Slug),
            Title = string.IsNullOrWhiteSpace(game.Title) ? game.Name : game.Title,
            Tagline = string.Empty,
            DescriptionMarkdown = string.Empty,
            Cover = string.IsNullOrWhiteSpace(game.ImagePath)
                ? null
                : new GameCover { Url = game.ImagePath, Alt = game.Title ?? game.Name },
            // У ПО жанров нет: вместо них категория софта.
            Genres = game.Kind == ProductKind.Software ? new List<string>() : new List<string> { GameGenres.TitleOf(genres, GameGenres.TagOf(game)) },
            BasePrice = game.Price,
            Currency = "USD",
            FinalPrice = game.Price,
            IsActive = true,
            ShowInFeaturedStorefront = false,
            FeaturedStorefrontPriority = 0,
            Platforms = new GamePlatforms { Windows = true },
            ReleaseDate = game.ReleaseDate
        };
    }

    private Dictionary<string, object?> BuildEditionPricing(GameDetails details, Game? linkedGame, string currency, ActiveDiscount? gameDiscount)
    {
        var result = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        foreach (var edition in details.Editions ?? new List<GameEdition>())
        {
            if (string.IsNullOrWhiteSpace(edition.Code))
            {
                continue;
            }
            decimal? basePrice = linkedGame is not null
                ? SuperBot.Core.Payments.GamePricing.TryGetEditionPrice(edition, linkedGame, currency, _fxRates.Current(), _fx)
                : (string.Equals(details.Currency ?? "USD", currency, StringComparison.OrdinalIgnoreCase) ? edition.Price : null);
            if (basePrice is null)
            {
                result[edition.Code] = null;
                continue;
            }
            // Своя скидка издания важнее общей скидки игры; без своей — действует общая (и её срок).
            var discountPercent = edition.DiscountPercent is > 0 ? edition.DiscountPercent : gameDiscount?.Percent;
            var discount = discountPercent ?? 0;
            var final = SuperBot.Core.Services.PriceCalculator.FinalPrice(basePrice.Value, discountPercent);
            result[edition.Code] = new
            {
                price = final,
                oldPrice = discount > 0 ? basePrice : (decimal?)null,
                discountPercent = discount > 0 ? discount : (decimal?)null,
                discountEndsAt = discount > 0 && edition.DiscountPercent is not > 0 ? gameDiscount?.EndsAt : null,
                currency
            };
        }
        return result;
    }

    /// <summary>Действующая скидка на игру: процент и до какого момента она живёт.</summary>
    private sealed record ActiveDiscount(decimal Percent, DateTime EndsAt);

    private object? BuildPricing(GameDetails details, Game? linkedGame, string currency, ActiveDiscount? activeDiscount)
    {
        var discount = activeDiscount?.Percent ?? 0;
        decimal? discountPercent = discount > 0 ? discount : null;

        // Базовая цена в запрошенной валюте. Без связанной игры (деталь-сирота) остаётся старое
        // поведение — цена детали в её собственной валюте, и только если валюта совпала.
        decimal? basePrice;
        if (linkedGame is not null)
        {
            basePrice = SuperBot.Core.Payments.GamePricing.TryGetPrice(linkedGame, currency, _fxRates.Current(), _fx);
        }
        else
        {
            basePrice = string.Equals(details.Currency ?? "USD", currency, StringComparison.OrdinalIgnoreCase) ? details.BasePrice : null;
        }

        if (basePrice is null)
        {
            // В этой валюте игру не продаём — честный null вместо цены с подменённым символом.
            // Фронт покажет «недоступно в EUR» и список валют, где цена есть.
            details.FinalPrice = SuperBot.Core.Services.PriceCalculator.FinalPrice(details.BasePrice, discountPercent);
            return null;
        }

        var finalPrice = SuperBot.Core.Services.PriceCalculator.FinalPrice(basePrice.Value, discountPercent);
        details.FinalPrice = finalPrice;
        // Поле детали — витринное эхо действующей скидки, чтобы старые читатели не показывали устаревший процент.
        details.DiscountPercent = discountPercent;

        return new
        {
            price = finalPrice,
            oldPrice = discount > 0 ? basePrice : (decimal?)null,
            discountPercent,
            discountEndsAt = activeDiscount?.EndsAt,
            currency
        };
    }

    /// <summary>
    /// DLC этой игры — отдельные товары каталога с ParentGameId = игра (как в Steam): у каждого своя
    /// страница, цена, скидка и пул ключей. Цена — в валюте покупателя, по тем же правилам, что у игры.
    /// </summary>
    private async Task<List<object>> BuildDlcAsync(string? gameId, string currency, IReadOnlySet<string> purchased)
    {
        var result = new List<object>();
        if (string.IsNullOrWhiteSpace(gameId))
        {
            return result;
        }
        // Из снимка каталога, а не чтением всех игр на каждый просмотр: в нём уже есть родитель, скидка, статус релиза
        // и обложка. Черновики в снимке витрины отсутствуют — на странице их и не должно быть.
        var dlcItems = (await _catalogSnapshot.GetAsync())
            .Where(item => string.Equals(item.ParentGameId, gameId, StringComparison.OrdinalIgnoreCase))
            // Дорогие — первыми: у игры с сотней DLC в видимые строки попадают расширения, а не косметика.
            .OrderByDescending(item => item.Price)
            .ThenBy(item => item.ReleaseDate);
        var rates = _fxRates.Current();
        foreach (var dlc in dlcItems)
        {
            var priced = CatalogPricing.InCurrency(dlc, currency, rates, _fx);
            result.Add(new
            {
                id = dlc.Id,
                slug = dlc.Slug,
                title = string.IsNullOrWhiteSpace(dlc.Title) ? dlc.Name : dlc.Title,
                coverUrl = dlc.ImagePath,
                releaseDate = dlc.ReleaseDate,
                isComingSoon = dlc.IsComingSoon,
                // Список DLC на странице игры — с галочками «добавить выбранные»: без ключей на складе
                // и уже купленное выбрать нельзя, как нельзя положить в корзину саму игру без ключей.
                inStock = dlc.InStock,
                owned = purchased.Contains(dlc.Id),
                pricing = priced is null
                    ? null
                    : new
                    {
                        price = priced.FinalPrice,
                        oldPrice = priced.DiscountPercent is > 0 ? priced.Price : (decimal?)null,
                        discountPercent = priced.DiscountPercent,
                        discountEndsAt = priced.DiscountPercent is > 0 ? priced.DiscountEndsAt : null,
                        currency
                    }
            });
        }
        return result;
    }

    /// <summary>
    /// Регион активации для витрины: где ключ работает, где нет, и подходит ли стране покупателя.
    /// Считается по политике игры (политики партий ключей — дело выдачи). Страна неизвестна — allowed = null:
    /// страница предупредит «укажите страну», но покупку не заблокирует.
    /// </summary>
    /// <summary>
    /// Регион для страницы игры. Подпись строит общий с каталогом и корзиной построитель:
    /// один и тот же товар обязан описываться одинаково во всех трёх местах, иначе покупатель
    /// читает «Activates in Europe» на странице и «Region-locked» в корзине и не верит обоим.
    /// </summary>
    private async Task<object> BuildRegionInfoAsync(Game? linkedGame, string? buyerCountry)
    {
        // Регион берём с полки: партия ключей может быть ограничена сильнее самой игры, и
        // выдача смотрит именно на её политику. Ключей нет — остаётся политика игры.
        var stock = string.IsNullOrWhiteSpace(linkedGame?.Id)
            ? new List<SuperBot.Core.Interfaces.IRepositories.RegionPoolStat>()
            : (await _gameKeyRepository.CountAvailableByRegionPolicyAsync(linkedGame!.Id!)).ToList();

        var summary = SuperBot.WebApi.Services.Regions.RegionSummary.BuildForKeys(
            stock.Select(item => item.Policy).ToList(),
            linkedGame?.RegionPolicy,
            _regions.Current,
            buyerCountry);

        return new
        {
            mode = summary.Mode,
            regions = summary.Regions,
            regionNames = summary.RegionNames,
            excludedCountries = summary.ExcludedCountries,
            buyerCountry = summary.BuyerCountry,
            allowed = summary.Allowed,
            summary = summary.Summary,
            exclusions = summary.Exclusions,
            badge = summary.Badge,
            kind = summary.Kind
        };
    }

    /// <summary>
    /// Варианты ключа с ценами и наличием: «Global за 61.99», «Europe за 52.99».
    ///
    /// Строятся по складу, а не по настройкам: вариант существует ровно тогда, когда под него
    /// есть ключи. Обещать покупателю дешёвый европейский ключ, которого нет в пуле, — верный
    /// способ получить отменённый заказ.
    ///
    /// Единственный вариант (обычный случай для магазина без региональных закупок) наружу не
    /// отдаётся: выбирать не из чего, и список из одной строки только мешает.
    /// </summary>
    private async Task<object?> BuildRegionOffersAsync(Game? linkedGame, string? buyerCountry, string currency)
    {
        if (linkedGame?.Id is null)
        {
            return null;
        }

        var stock = await _gameKeyRepository.CountAvailableByRegionPolicyAsync(linkedGame.Id);
        if (stock.Count < 2)
        {
            return null;
        }

        var catalog = _regions.Current;
        var rates = _fxRates.Current();

        // Партии с одинаковой областью активации — один вариант: покупателю всё равно, из какой
        // пачки придёт ключ, ему важно, где ключ работает и сколько стоит.
        var offers = stock
            .GroupBy(item => SuperBot.Core.Regions.RegionOffer.EffectiveKeyOf(item.Policy, linkedGame.RegionPolicy))
            .Select(group =>
            {
                var policy = group.First().Policy ?? linkedGame.RegionPolicy;
                var summary = SuperBot.WebApi.Services.Regions.RegionSummary.Build(policy, catalog, buyerCountry);
                return new
                {
                    offerKey = group.Key,
                    title = SuperBot.Core.Regions.RegionOffer.TitleOf(policy, catalog),
                    summary = summary.Summary,
                    exclusions = summary.Exclusions,
                    // Код и списки — чтобы витрина собрала название и подпись на языке покупателя.
                    kind = summary.Kind,
                    regionNames = summary.RegionNames,
                    excludedCountries = summary.ExcludedCountries,
                    allowed = summary.Allowed,
                    available = group.Sum(item => item.Available),
                    price = SuperBot.Core.Payments.RegionOfferPricing.TryGetPrice(
                        linkedGame, group.Key, group.First().EditionCode, currency, rates, _fx),
                    currency
                };
            })
            .Where(offer => offer.price is not null)
            .OrderBy(offer => offer.price)
            .ToList();

        return offers.Count < 2 ? null : offers;
    }

    /// <summary>Для страницы DLC — базовая игра, которая нужна для активации.</summary>
    private async Task<object?> BuildParentGameAsync(Game? linkedGame)
    {
        if (string.IsNullOrWhiteSpace(linkedGame?.ParentGameId))
        {
            return null;
        }
        var parent = await _gameRepository.GetByIdAsync(linkedGame.ParentGameId);
        if (parent is null)
        {
            return null;
        }
        return new
        {
            id = parent.Id,
            slug = parent.Slug,
            title = string.IsNullOrWhiteSpace(parent.Title) ? parent.Name : parent.Title,
            coverUrl = parent.ImagePath
        };
    }

    /// <summary>
    /// Наличие по изданиям: у каждого издания свой пул ключей (ключ Standard не подходит покупателю Deluxe).
    /// Базовое издание (IsDefault или без ключей с кодом) считается по ключам без кода издания.
    /// </summary>
    private async Task<Dictionary<string, object>> BuildEditionAvailabilityAsync(GameDetails details, Game? linkedGame, bool isComingSoon)
    {
        var result = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        var editions = details.Editions ?? new List<GameEdition>();
        if (editions.Count < 2 || linkedGame?.Id is null)
        {
            return result;
        }
        if (isComingSoon)
        {
            foreach (var edition in editions.Where(e => !string.IsNullOrWhiteSpace(e.Code)))
            {
                result[edition.Code!] = new { status = "comingSoon" };
            }
            return result;
        }
        IReadOnlyDictionary<string, int> byEdition;
        try
        {
            byEdition = await _gameKeyRepository.CountAvailableByEditionAsync(linkedGame.Id);
        }
        catch
        {
            return result;
        }
        var threshold = linkedGame.LowStockThreshold ?? _stock.LowStockThreshold;
        var forcedLow = linkedGame.LowStockFromUtc is { } from && from <= DateTime.UtcNow;
        foreach (var edition in GameEditions.Sellable(editions))
        {
            var available = GameEditions.AvailableFor(byEdition, edition, GameEditions.IsDefaultIn(editions, edition));
            var status = available <= 0 ? "outOfStock" : available <= threshold || forcedLow ? "lowStock" : "inStock";
            result[edition.Code!] = new { status };
        }
        return result;
    }

    /// <summary>
    /// Наличие для витрины: «в наличии / скоро закончится / нет в наличии». Считается по свободным ключам
    /// в пуле; порог «мало» — у игры (админка ключей) или общий каталожный. Точное число наружу не отдаём —
    /// покупателю нужен статус, а не объёмы склада. У невышедшей игры ключей закономерно нет — статус
    /// «скоро», а не «нет в наличии».
    /// </summary>
    private async Task<object> BuildAvailabilityAsync(Game? linkedGame, bool isComingSoon)
    {
        if (isComingSoon)
        {
            return new { status = "comingSoon" };
        }
        if (linkedGame?.Id is null)
        {
            return new { status = "inStock" };
        }
        int available;
        try
        {
            available = await _gameKeyRepository.CountAvailableByGameAsync(linkedGame.Id);
        }
        catch
        {
            // Склад не ответил — не пугаем покупателя «нет в наличии» из-за сбоя подсчёта.
            return new { status = "inStock" };
        }
        var threshold = linkedGame.LowStockThreshold ?? _stock.LowStockThreshold;
        // «Скоро закончится» — по порогу или с даты, заданной админом вручную (ажиотаж).
        var forcedLow = linkedGame.LowStockFromUtc is { } from && from <= DateTime.UtcNow;
        var status = available <= 0 ? "outOfStock" : available <= threshold || forcedLow ? "lowStock" : "inStock";
        return new { status };
    }

    /// <summary>
    /// «Похожие»: сначала выбранные в админке, потом игры того же жанра, потом остальной каталог.
    /// DLC и невышедшие игры в подборку не попадают. Цена — в валюте покупателя со скидкой, оценка —
    /// из отзывов: раньше карточки шли с базовой ценой без валюты и нулевым рейтингом.
    /// </summary>
    private async Task<List<object>> BuildRecommendations(GameDetails details, string currency, int limit = 8)
    {
        var normalizedLimit = Math.Clamp(limit, 1, 12);
        // Пул — снимок каталога в валюте покупателя: в нём уже есть вид, жанры, категория софта, оценка,
        // скидка и цена каждой позиции, и он один на всех посетителей. Раньше каждый просмотр страницы
        // читал все игры и все карточки из базы, а цену пересчитывал отдельно на каждую карточку.
        var catalog = await _catalogSnapshot.GetInCurrencyAsync(currency, _fxRates.Current(), _fx);
        var byId = catalog
            .Where(item => !string.IsNullOrWhiteSpace(item.Id))
            .GroupBy(item => item.Id, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
        var picked = new List<CatalogItem>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { details.GameId ?? string.Empty };
        bool Eligible(CatalogItem item) => !seen.Contains(item.Id) && item.ParentGameId is null && !item.IsComingSoon;

        foreach (var id in details.SimilarGameIds ?? new List<string>())
        {
            if (!string.IsNullOrWhiteSpace(id) && byId.TryGetValue(id, out var item) && Eligible(item) && seen.Add(item.Id))
            {
                picked.Add(item);
            }
        }

        if (picked.Count < normalizedLimit)
        {
            byId.TryGetValue(details.GameId ?? string.Empty, out var current);
            var kind = current?.Kind ?? ProductKind.Game;
            // Досбор — только своего вида: к антивирусу не подбираем шутер. Выбранное в админке выше — как есть.
            var pool = catalog.Where(item => Eligible(item) && item.Kind == kind).ToList();
            // Ближе всего — та же категория раздела у ПО и общий жанр у игр (жанры позиций уже лежат в снимке).
            var genres = new HashSet<string>(details.Genres ?? new List<string>(), StringComparer.OrdinalIgnoreCase);
            var closest = kind == ProductKind.Software
                ? pool.Where(item => !string.IsNullOrWhiteSpace(current?.SoftwareCategory)
                    && string.Equals(item.SoftwareCategory, current.SoftwareCategory, StringComparison.OrdinalIgnoreCase))
                : pool.Where(item => genres.Count > 0 && item.Genres.Any(genres.Contains));
            foreach (var item in closest.Concat(pool))
            {
                if (picked.Count >= normalizedLimit) break;
                if (seen.Add(item.Id)) picked.Add(item);
            }
        }

        // Карточка та же, что на полках главной и в каталоге: витрина рисует «похожие» той же полкой.
        var regionCatalog = _regions.Current;
        var buyerCountry = SuperBot.WebApi.Services.Regions.BuyerCountry.Resolve(Request);
        var titles = await SuperBot.WebApi.Services.Storefront.TaxonomyTitles.LoadAsync(
            HttpContext.RequestServices.GetRequiredService<SuperBot.WebApi.Services.IGameGenreDirectory>(),
            HttpContext.RequestServices.GetRequiredService<SuperBot.WebApi.Services.ISoftwareCategoryDirectory>(),
            SuperBot.WebApi.Services.BuyerLanguage.Resolve(Request));
        return picked
            .Take(normalizedLimit)
            .Select(item => SuperBot.WebApi.Services.Storefront.StorefrontCards.ToCardDto(item, regionCatalog, buyerCountry, titles: titles))
            .ToList();
    }


    /// <summary>
    /// Игры из оплаченных заказов посетителя; у гостя — пусто. По всем именам из токена: заказ записан
    /// по email, а Identity.Name у настоящего токена — отображаемое имя; поиск по нему одному не находил
    /// покупку. Через PurchasedGames, а не по order.GameId: то поле хранит только первую позицию заказа.
    /// </summary>
    private async Task<IReadOnlySet<string>> LoadPurchasedAsync()
    {
        if (!User.Identity?.IsAuthenticated ?? true)
        {
            return new HashSet<string>();
        }
        var orders = await _orderRepository.GetOrdersByUsersAsync(User.GetOrderOwnerAliases());
        return SuperBot.Core.Services.PurchasedGames.From(orders);
    }

    private async Task<object> BuildUserContext(string gameId, IReadOnlySet<string> purchased)
    {
        if (!User.Identity?.IsAuthenticated ?? true)
        {
            return new { isWishlisted = false, hasPurchased = false, myReview = (object)null };
        }

        var userId = GetUserId();
        var wishlistIds = await _wishlistRepository.GetGameIdsAsync(userId);
        var hasPurchased = !string.IsNullOrWhiteSpace(gameId) && purchased.Contains(gameId);
        var review = await _gameReviewRepository.GetByUserAsync(gameId, userId);

        return new
        {
            isWishlisted = wishlistIds.Contains(gameId),
            hasPurchased,
            myReview = review
        };
    }

    // Не «sub» напрямую: JwtBearer отдаёт его как NameIdentifier (см. CurrentUserExtensions.GetUserId).
    private string GetUserId() => User.GetUserId();

    private static string NormalizeSlug(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var builder = new StringBuilder();
        var lastWasDash = false;

        foreach (var ch in value.Trim().ToLowerInvariant())
        {
            if (char.IsLetterOrDigit(ch))
            {
                builder.Append(ch);
                lastWasDash = false;
                continue;
            }

            if (ch == ' ' || ch == '-' || ch == '_')
            {
                if (!lastWasDash && builder.Length > 0)
                {
                    builder.Append('-');
                    lastWasDash = true;
                }
            }
        }

        var normalized = builder.ToString().Trim('-');
        return normalized;
    }
}
