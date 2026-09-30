using Microsoft.Extensions.Caching.Memory;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Services;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Готовая к показу позиция каталога: игра, уже собранная со скидкой, обложкой,
/// оценкой и остатком ключей. Всё, по чему витрина фильтрует и сортирует, лежит здесь —
/// докладывать из других коллекций не требуется.
/// </summary>
public sealed record CatalogItem(
    string Id,
    string Slug,
    string Name,
    string Title,
    string Description,
    GameType GameType,
    string Category,
    string ImagePath,
    string? CoverMediaId,
    DateTime ReleaseDate,
    bool IsComingSoon,
    decimal Price,
    decimal FinalPrice,
    /// <summary>Валюта, в которой выражены Price и FinalPrice этой позиции.</summary>
    string Currency,
    /// <summary>Ручные цены в других валютах — сырьё для приведения витрины к валюте покупателя.</summary>
    IReadOnlyDictionary<string, decimal> Prices,
    decimal? DiscountPercent,
    bool DiscountActive,
    DateTime? DiscountEndsAt,
    string[] Genres,
    string[] Platforms,
    double? Rating,
    int ReviewCount,
    bool InStock,
    int? LowStockLeft,
    /// <summary>
    /// Сырой запас: свободных и выданных ключей. Витрине хватает InStock/LowStockLeft, а складу
    /// в админке нужны сами числа — и они уже посчитаны здесь, на весь снимок разом.
    /// </summary>
    int KeysAvailable,
    int KeysDelivered,
    /// <summary>Порог «мало» этой игры, если задан свой; иначе общий из настроек сайта.</summary>
    int? LowStockThreshold,
    bool ShowInFeaturedStorefront,
    int FeaturedStorefrontPriority,
    /// <summary>Студия и издатель — для ссылок «ещё игры студии» со страницы товара.</summary>
    string? Developer = null,
    string? Publisher = null,
    /// <summary>Теги из карточки — для ссылок-тегов и фильтра `tag`.</summary>
    string[]? Tags = null,
    /// <summary>Для DLC — id базовой игры: в общем списке каталога DLC не показываются.</summary>
    string? ParentGameId = null,
    /// <summary>
    /// Где активируется ключ. В снимке лежит сама политика, а не готовый вердикт: снимок один
    /// на всех посетителей, а «подходит ли покупателю» зависит от его страны и считается на
    /// каждый запрос.
    /// </summary>
    SuperBot.Core.Regions.RegionPolicy? RegionPolicy = null,
    /// <summary>Игра или ПО — по нему каталог отделяет игры от софта.</summary>
    ProductKind Kind = ProductKind.Game,
    /// <summary>Категория софта (Tag); у игр null.</summary>
    string? SoftwareCategory = null,
    /// <summary>
    /// Лицензии ПО (издания со сроком и устройствами). У игр null. Цена позиции (Price, FinalPrice, скидка) — это цена
    /// одной из них, <see cref="LicenseCode"/>: самой дешёвой из подходящих под фильтры, см. <see cref="SoftwareLicenses"/>.
    /// </summary>
    IReadOnlyList<CatalogLicense>? Licenses = null,
    /// <summary>Лицензия, чья цена сейчас стоит в позиции. null — у товара нет лицензий.</summary>
    string? LicenseCode = null,
    /// <summary>Где активируется ключ ПО — для фильтра «Activates on». У игр null.</summary>
    SoftwareActivationTarget? Activation = null,
    /// <summary>Черновик карточки. Витрина черновиков не видит (<see cref="ICatalogSnapshotService.GetAsync"/>), админка — видит.</summary>
    bool IsDraft = false,
    /// <summary>Код жанра (Settings.GameCategories.Tag) — адрес страницы жанра. У ПО null.</summary>
    string? Genre = null,
    /// <summary>
    /// Название, имя и slug, приведённые к виду для поиска (<see cref="CatalogQuery.SearchText"/>). Считается при сборке
    /// снимка; null — позиция собрана в обход снимка (тесты), тогда поиск нормализует её сам.
    /// </summary>
    string? SearchText = null,
    /// <summary>
    /// Трейлер из галереи карточки (помеченный как трейлер, иначе первое видео) — для превью при наведении на плитку.
    /// null — видео у товара нет. Постер — обложка ролика, пока он грузится.
    /// </summary>
    string? TrailerUrl = null,
    string? TrailerPosterUrl = null)
{
    /// <summary>Переводы описания карточки по языкам сайта; подставляются на выходе (StorefrontCards). Свойство, а не параметр: тесты собирают запись по позициям.</summary>
    public Dictionary<string, string>? DescriptionI18n { get; init; }
    /// <summary>Переводы жанров карточки по позициям (GameDetails.GenresI18n); подставляются на выходе.</summary>
    public Dictionary<string, List<string>>? GenresI18n { get; init; }
}

/// <summary>
/// Лицензия ПО в каталоге — издание со своей ценой, скидкой и складом. Цены — в валюте позиции.
/// </summary>
public sealed record CatalogLicense(
    string Code,
    string Title,
    /// <summary>«1 year · 3 devices»; null, если у издания не заполнены срок и устройства.</summary>
    string? Label,
    int? TermMonths,
    int? Devices,
    bool IsSubscription,
    bool IsDefault,
    decimal Price,
    decimal FinalPrice,
    /// <summary>Ручные цены издания в других валютах.</summary>
    IReadOnlyDictionary<string, decimal> Prices,
    decimal? DiscountPercent,
    /// <summary>Скидка своя у издания (без срока), а не общая скидка товара.</summary>
    bool OwnDiscount,
    /// <summary>Когда кончится скидка: срок есть только у общей скидки товара, своя скидка издания бессрочная.</summary>
    DateTime? DiscountEndsAt,
    bool InStock,
    /// <summary>Остаток этой лицензии, когда он мал (иначе null) — «3 left» на карточке относится к ней, а не ко всему товару.</summary>
    int? LowStockLeft = null);

/// <summary>
/// Каталог, собранный целиком и положенный в память.
///
/// Зачем так. Карточка товара складывается из пяти источников: игра, скидка, описание,
/// обложка и запас ключей. Собирать её на каждый запрос — это несколько обращений к базе
/// плюс поход за обложкой на каждую игру. При этом каталог одинаков для всех посетителей
/// и меняется редко, поэтому дешевле собрать его один раз и раздавать готовым.
///
/// Что это даёт витрине: фильтровать и сортировать можно по итоговой цене, оценке и
/// наличию сразу — не строя соединений между коллекциями ради каждого запроса.
///
/// Границы применимости: снапшот держится в памяти процесса целиком. Для магазина
/// на тысячи позиций это нормально, на сотни тысяч — уже нет; тогда фильтрацию
/// придётся уносить в саму базу, а поля вроде итоговой цены денормализовать в документ игры.
/// </summary>
public interface ICatalogSnapshotService
{
    /// <summary>Каталог витрины: только опубликованные карточки.</summary>
    Task<IReadOnlyList<CatalogItem>> GetAsync();

    /// <summary>
    /// Каталог вместе с черновиками — для списков админки. Без них черновик (например, только что сделанная копия
    /// товара) пропадал из списка и поиска админки, и найти его можно было только по прямой ссылке.
    /// </summary>
    Task<IReadOnlyList<CatalogItem>> GetWithDraftsAsync();

    /// <summary>
    /// Каталог в валюте покупателя (<see cref="CatalogPricing.InCurrency(IReadOnlyList{CatalogItem}, string, SuperBot.Core.Payments.FxRateBook?, SuperBot.Core.Payments.FxOptions?)"/>),
    /// посчитанный один раз на снимок и валюту, а не на каждый запрос: у ПО пересчитывается каждая лицензия.
    /// Смена курса или наценки даёт новый ключ, так что устаревшую цену кэш не переживёт.
    /// </summary>
    Task<IReadOnlyList<CatalogItem>> GetInCurrencyAsync(string currency, SuperBot.Core.Payments.FxRateBook? rates, SuperBot.Core.Payments.FxOptions? fx, bool includeDrafts = false);

    /// <summary>Сбросить собранный каталог — после правки игр, скидок или запасов.</summary>
    void Invalidate();
}

public sealed class CatalogSnapshotService : ICatalogSnapshotService
{
    public const string CacheKey = "catalog:snapshot";

    /// <summary>
    /// Срок жизни снапшота. Это ещё и потолок задержки для изменений, которые мы не сбрасываем
    /// вручную: новый отзыв или выданный ключ доедут до витрины в пределах этого времени.
    /// </summary>
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(2);

    /// <summary>С этого остатка витрина торопит покупателя; точный размер запаса наружу не уходит.</summary>
    /// <summary>Запасной порог, если настройки недоступны; рабочий — в StockOptions (настройки сайта).</summary>
    public const int LowStockThreshold = 3;

    private readonly IGameRepository _games;
    private readonly IGameDiscountRepository _discounts;
    private readonly IGameDetailsRepository _details;
    private readonly IMediaAssetRepository _media;
    private readonly IGameReviewRepository _reviews;
    private readonly IGameKeyRepository _keys;
    private readonly IGameGenreDirectory _genres;
    private readonly ISoftwareCategoryDirectory _softwareCategories;
    private readonly IMemoryCache _cache;
    private readonly Microsoft.Extensions.Options.IOptionsMonitor<SuperBot.WebApi.Services.SiteSettings.StockOptions> _stock;

    public CatalogSnapshotService(
        IGameRepository games,
        IGameDiscountRepository discounts,
        IGameDetailsRepository details,
        IMediaAssetRepository media,
        IGameReviewRepository reviews,
        IGameKeyRepository keys,
        IGameGenreDirectory genres,
        ISoftwareCategoryDirectory softwareCategories,
        IMemoryCache cache,
        Microsoft.Extensions.Options.IOptionsMonitor<SuperBot.WebApi.Services.SiteSettings.StockOptions> stock)
    {
        _stock = stock;
        _games = games;
        _discounts = discounts;
        _details = details;
        _media = media;
        _reviews = reviews;
        _keys = keys;
        _genres = genres;
        _softwareCategories = softwareCategories;
        _cache = cache;
    }

    /// <summary>
    /// Собранный каталог: весь и опубликованная часть. Держим оба, чтобы витрина не фильтровала на каждый запрос.
    /// Приведённые к валюте копии живут рядом и умирают вместе со снимком.
    /// </summary>
    private sealed record Snapshot(IReadOnlyList<CatalogItem> All, IReadOnlyList<CatalogItem> Published)
    {
        public System.Collections.Concurrent.ConcurrentDictionary<string, IReadOnlyList<CatalogItem>> ByCurrency { get; } = new(StringComparer.Ordinal);
    }

    public async Task<IReadOnlyList<CatalogItem>> GetAsync() => (await GetSnapshotAsync()).Published;

    public async Task<IReadOnlyList<CatalogItem>> GetWithDraftsAsync() => (await GetSnapshotAsync()).All;

    public async Task<IReadOnlyList<CatalogItem>> GetInCurrencyAsync(string currency, SuperBot.Core.Payments.FxRateBook? rates, SuperBot.Core.Payments.FxOptions? fx, bool includeDrafts = false)
    {
        var snapshot = await GetSnapshotAsync();
        var source = includeDrafts ? snapshot.All : snapshot.Published;
        // В ключе всё, от чего зависит цена: валюта, курс с моментом его снятия, наценка и правило округления.
        var rate = rates?.For(currency);
        var key = string.Join('|', includeDrafts ? "all" : "published", currency, rate?.Rate, rate?.CapturedAtUtc.Ticks, fx?.MarkupPercent, fx?.RuleFor(currency));
        return snapshot.ByCurrency.GetOrAdd(key, _ => CatalogPricing.InCurrency(source, currency, rates, fx));
    }

    private async Task<Snapshot> GetSnapshotAsync()
    {
        var snapshot = await _cache.GetOrCreateAsync(CacheKey, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = CacheTtl;
            var all = await BuildAsync();
            // Черновики витрине не отдаются. Фильтр здесь, а не в каждом запросе: снимок — единственный источник
            // для витрины, полок главной и поиска, поэтому одного места достаточно и нельзя забыть закрыть ещё одно.
            return new Snapshot(all, all.Where(item => !item.IsDraft).ToList());
        });

        return snapshot ?? new Snapshot(Array.Empty<CatalogItem>(), Array.Empty<CatalogItem>());
    }

    public void Invalidate() => _cache.Remove(CacheKey);

    private async Task<IReadOnlyList<CatalogItem>> BuildAsync()
    {
        var games = await _games.GetAllAsync();
        if (games.Count == 0)
        {
            return Array.Empty<CatalogItem>();
        }

        var gameIds = games.Select(game => game.Id!).Where(id => !string.IsNullOrWhiteSpace(id)).ToArray();

        // Каждый источник — ровно один запрос на весь каталог.
        var discounts = await _discounts.GetByGameIdsAsync(gameIds);
        var allDetails = await _details.GetByGameIdsAsync(gameIds);
        var ratings = await _reviews.GetSummariesAsync(gameIds);
        var stock = await _keys.GetInventorySummaryAsync();
        var keyTypes = await _keys.GetKeyTypeSummaryAsync();
        var (categoryTitles, softwareCategoryTitles) = await LoadCategoryTitlesAsync();

        // Платформы игры — это те, для которых у нас есть ключи. Считаем по всему пулу,
        // включая выданные: временно кончившийся запас не отменяет того, что игра
        // продаётся, например, для Xbox.
        var platformsByGameId = keyTypes
            .GroupBy(stat => stat.GameId)
            .ToDictionary(
                group => group.Key,
                group => group
                    .Select(stat => KeyPlatform.FromKeyType(stat.KeyType))
                    .Distinct()
                    .OrderBy(platform => platform, StringComparer.OrdinalIgnoreCase)
                    .ToArray());

        var discountByGameId = discounts
            .Where(discount => !string.IsNullOrWhiteSpace(discount.GameId))
            .ToDictionary(discount => discount.GameId!, discount => discount);
        var detailsByGameId = allDetails
            .Where(details => !string.IsNullOrWhiteSpace(details.GameId))
            .ToDictionary(details => details.GameId!, details => details);
        var stockByGameId = stock.ToDictionary(stat => stat.GameId, stat => stat.Available);
        var deliveredByGameId = stock.ToDictionary(stat => stat.GameId, stat => stat.Delivered);
        var coverUrlByMediaId = await LoadCoverUrlsAsync(games);
        // У ПО каждая лицензия — издание со своим складом; у игр запас издания витрине каталога не нужен.
        var softwareIds = games.Where(game => game.Kind == ProductKind.Software && !string.IsNullOrWhiteSpace(game.Id)).Select(game => game.Id!).ToList();
        var licenseStock = softwareIds.Count > 0
            ? await _keys.CountAvailableByEditionForGamesAsync(softwareIds)
            : new Dictionary<string, IReadOnlyDictionary<string, int>>();

        var utcNow = DateTime.UtcNow;

        // Черновики собираются вместе со всеми и помечаются IsDraft; от витрины их отсекает GetAsync.
        return games
            .Select(game =>
        {
            var gameId = game.Id ?? string.Empty;
            discountByGameId.TryGetValue(gameId, out var discount);
            detailsByGameId.TryGetValue(gameId, out var details);
            ratings.TryGetValue(gameId, out var rating);
            stockByGameId.TryGetValue(gameId, out var keysAvailable);
            deliveredByGameId.TryGetValue(gameId, out var keysDelivered);

            // Статус релиза считает сервер (клиентским часам доверять нельзя), а скидка
            // на невышедшую игру гасится: продать её всё равно нельзя — прайсинг откажет.
            var isComingSoon = GameRelease.IsUpcoming(game.ReleaseDate, utcNow);
            var discountActive = !isComingSoon && discount is not null && discount.IsActiveAt(utcNow);
            var discountPercent = discountActive ? discount!.DiscountPercent : (decimal?)null;

            var genres = details?.Genres?.Where(genre => !string.IsNullOrWhiteSpace(genre)).ToArray()
                ?? Array.Empty<string>();
            var genreTag = game.Kind == ProductKind.Software ? null : GameGenres.TagOf(game);
            var fallbackCategory = GameGenres.TitleOf(categoryTitles, genreTag);

            // У невышедшей игры ключей закономерно нет — «нет в наличии» тут ввело бы
            // в заблуждение, поэтому запас показываем только для того, что уже продаётся.
            var stockKnown = !isComingSoon;
            var software = game.Kind == ProductKind.Software;
            // «Мало» — по порогу игры, иначе по общему из настроек; либо с даты, заданной админом. Считается один раз
            // на позицию: тем же правилом пользуются и сама позиция, и её лицензии.
            var lowStockThreshold = game.LowStockThreshold ?? _stock.CurrentValue.LowStockThreshold;
            var forcedLowStock = game.LowStockFromUtc is { } lowStockFrom && lowStockFrom <= utcNow;

            // Трейлер для превью при наведении — одним правилом с рекомендациями (CatalogTrailer).
            var trailer = SuperBot.Core.Catalog.CatalogTrailer.Pick(details);

            var item = new CatalogItem(
                Id: gameId,
                Slug: game.Slug,
                Name: game.Name,
                Title: game.Title,
                Description: game.Description,
                GameType: game.GameType,
                // У ПО жанра нет: GameType у него — значение по умолчанию, и раньше каждая программа
                // числилась в «Action». Категория ПО — название его раздела («VPN & privacy»).
                Category: software
                    ? (game.SoftwareCategory is { } tag && softwareCategoryTitles.TryGetValue(tag, out var softwareTitle) ? softwareTitle : "Software")
                    : fallbackCategory,
                ImagePath: ResolveCover(game, coverUrlByMediaId),
                CoverMediaId: game.CoverMediaId,
                TrailerUrl: trailer.Url,
                TrailerPosterUrl: trailer.Poster,
                ReleaseDate: game.ReleaseDate,
                IsComingSoon: isComingSoon,
                Price: game.Price,
                FinalPrice: PriceCalculator.FinalPrice(game.Price, discountPercent),
                Currency: SuperBot.Core.Payments.GamePricing.BaseCurrency(game),
                Prices: game.Prices ?? new Dictionary<string, decimal>(),
                DiscountPercent: discountPercent,
                DiscountActive: discountActive,
                DiscountEndsAt: discountActive ? discount!.EndDate : null,
                // У ПО жанров нет, а подставной жанр из GameType выдал бы его в жанровые полки.
                Genres: software ? genres : genres.Length > 0 ? genres : new[] { fallbackCategory },
                // У ПО — системы из карточки (ключ вендорский и о системе не говорит). У игр: ключей ещё нет
                // (например, игра не вышла) — показываем платформы из описания.
                Platforms: software
                    ? SoftwareCatalog.OsLabels(details?.Platforms)
                    : platformsByGameId.TryGetValue(gameId, out var keyPlatforms) && keyPlatforms.Length > 0
                        ? keyPlatforms
                        : BuildPlatformLabels(details?.Platforms),
                // Оценка есть только у игр с отзывами: ноль звёзд и «нет отзывов» — разные вещи.
                Rating: rating is null ? null : Math.Round(rating.Average, 1),
                ReviewCount: rating?.Count ?? 0,
                KeysAvailable: keysAvailable,
                KeysDelivered: keysDelivered,
                LowStockThreshold: game.LowStockThreshold,
                InStock: !stockKnown || keysAvailable > 0,
                LowStockLeft: stockKnown && keysAvailable > 0 && (keysAvailable <= lowStockThreshold || forcedLowStock)
                    ? keysAvailable
                    : null,
                Kind: game.Kind,
                SoftwareCategory: game.Kind == ProductKind.Software ? game.SoftwareCategory : null,
                IsDraft: details?.IsDraft ?? false,
                Genre: genreTag,
                ShowInFeaturedStorefront: details?.ShowInFeaturedStorefront ?? false,
                FeaturedStorefrontPriority: details?.FeaturedStorefrontPriority ?? int.MaxValue,
                Developer: details?.Developer?.Name,
                Publisher: details?.Publisher?.Name,
                Tags: details?.Tags?.Where(tag => !string.IsNullOrWhiteSpace(tag)).ToArray() ?? Array.Empty<string>(),
                ParentGameId: string.IsNullOrWhiteSpace(game.ParentGameId) ? null : game.ParentGameId,
                RegionPolicy: game.RegionPolicy,
                Licenses: software
                    ? SoftwareLicenses.Build(details, discountPercent, discountActive ? discount!.EndDate : null,
                        licenseStock.TryGetValue(gameId, out var byEdition) ? byEdition : null, stockKnown,
                        lowStockThreshold,
                        forcedLowStock)
                    : null,
                Activation: software ? details?.Activation?.Target : null,
                // Строка для поиска считается здесь один раз, а не на каждый запрос к каталогу.
                SearchText: CatalogQuery.SearchText(game.Title, game.Name, game.Slug))
            {
                DescriptionI18n = game.DescriptionI18n,
                GenresI18n = details?.GenresI18n
            };

            return SoftwareLicenses.Represent(item);
        }).ToList();
    }

    /// <summary>
    /// Названия жанров и категорий софта берём из настроек — их правит админка, и витрина показывает именно их.
    /// </summary>
    private async Task<(IReadOnlyList<GameCategory> Games, Dictionary<string, string> Software)> LoadCategoryTitlesAsync()
    {
        // Справочники сами подставляют списки по умолчанию, когда настройки пусты или недоступны.
        var titles = await _genres.GetAsync();
        var softwareTitles = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var category in await _softwareCategories.GetAsync())
        {
            if (!string.IsNullOrWhiteSpace(category.Title))
            {
                softwareTitles[category.Tag] = category.Title;
            }
        }

        return (titles, softwareTitles);
    }

    /// <summary>Обложки, лежащие в медиатеке, — одним запросом на весь каталог.</summary>
    private async Task<Dictionary<string, string>> LoadCoverUrlsAsync(IEnumerable<Game> games)
    {
        var mediaIds = games
            .Where(game => string.IsNullOrWhiteSpace(game.ImagePath) && !string.IsNullOrWhiteSpace(game.CoverMediaId))
            .Select(game => game.CoverMediaId!)
            .Distinct()
            .ToArray();

        var urls = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (mediaIds.Length == 0)
        {
            return urls;
        }

        try
        {
            foreach (var asset in await _media.GetByIdsAsync(mediaIds))
            {
                if (!string.IsNullOrWhiteSpace(asset?.Id) && !string.IsNullOrWhiteSpace(asset?.Url))
                {
                    urls[asset.Id] = asset.Url;
                }
            }
        }
        catch
        {
            // Медиатека недоступна — у игр останется их собственный imagePath.
        }

        return urls;
    }

    private static string ResolveCover(Game game, IReadOnlyDictionary<string, string> coverUrlByMediaId)
    {
        if (!string.IsNullOrWhiteSpace(game.ImagePath))
        {
            return game.ImagePath;
        }

        return !string.IsNullOrWhiteSpace(game.CoverMediaId) &&
               coverUrlByMediaId.TryGetValue(game.CoverMediaId, out var url)
            ? url
            : game.ImagePath;
    }

    /// <summary>
    /// Ярлыки платформ для витрины (иконки на карточках, фильтр каталога).
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
