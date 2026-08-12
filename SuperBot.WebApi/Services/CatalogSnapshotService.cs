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
    decimal? DiscountPercent,
    bool DiscountActive,
    DateTime? DiscountEndsAt,
    string[] Genres,
    string[] Platforms,
    double? Rating,
    int ReviewCount,
    bool InStock,
    int? LowStockLeft,
    bool ShowInFeaturedStorefront,
    int FeaturedStorefrontPriority);

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
    Task<IReadOnlyList<CatalogItem>> GetAsync();

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
    public const int LowStockThreshold = 3;

    private readonly IGameRepository _games;
    private readonly IGameDiscountRepository _discounts;
    private readonly IGameDetailsRepository _details;
    private readonly IMediaAssetRepository _media;
    private readonly IGameReviewRepository _reviews;
    private readonly IGameKeyRepository _keys;
    private readonly ISettingsRepository _settings;
    private readonly IMemoryCache _cache;

    public CatalogSnapshotService(
        IGameRepository games,
        IGameDiscountRepository discounts,
        IGameDetailsRepository details,
        IMediaAssetRepository media,
        IGameReviewRepository reviews,
        IGameKeyRepository keys,
        ISettingsRepository settings,
        IMemoryCache cache)
    {
        _games = games;
        _discounts = discounts;
        _details = details;
        _media = media;
        _reviews = reviews;
        _keys = keys;
        _settings = settings;
        _cache = cache;
    }

    public async Task<IReadOnlyList<CatalogItem>> GetAsync()
    {
        var snapshot = await _cache.GetOrCreateAsync(CacheKey, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = CacheTtl;
            return await BuildAsync();
        });

        return snapshot ?? Array.Empty<CatalogItem>();
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
        var categoryTitles = await LoadCategoryTitlesAsync();

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
        var coverUrlByMediaId = await LoadCoverUrlsAsync(games);

        var utcNow = DateTime.UtcNow;

        return games.Select(game =>
        {
            var gameId = game.Id ?? string.Empty;
            discountByGameId.TryGetValue(gameId, out var discount);
            detailsByGameId.TryGetValue(gameId, out var details);
            ratings.TryGetValue(gameId, out var rating);
            stockByGameId.TryGetValue(gameId, out var keysAvailable);

            // Статус релиза считает сервер (клиентским часам доверять нельзя), а скидка
            // на невышедшую игру гасится: продать её всё равно нельзя — прайсинг откажет.
            var isComingSoon = GameRelease.IsUpcoming(game.ReleaseDate, utcNow);
            var discountActive = !isComingSoon && discount is not null && discount.IsActiveAt(utcNow);
            var discountPercent = discountActive ? discount!.DiscountPercent : (decimal?)null;

            var genres = details?.Genres?.Where(genre => !string.IsNullOrWhiteSpace(genre)).ToArray()
                ?? Array.Empty<string>();
            var fallbackCategory = GameTypeMapper.DescriptionsCategories[game.GameType];

            // У невышедшей игры ключей закономерно нет — «нет в наличии» тут ввело бы
            // в заблуждение, поэтому запас показываем только для того, что уже продаётся.
            var stockKnown = !isComingSoon;

            return new CatalogItem(
                Id: gameId,
                Slug: game.Slug,
                Name: game.Name,
                Title: game.Title,
                Description: game.Description,
                GameType: game.GameType,
                Category: categoryTitles.TryGetValue((int)game.GameType, out var title) ? title : fallbackCategory,
                ImagePath: ResolveCover(game, coverUrlByMediaId),
                CoverMediaId: game.CoverMediaId,
                ReleaseDate: game.ReleaseDate,
                IsComingSoon: isComingSoon,
                Price: game.Price,
                FinalPrice: PriceCalculator.FinalPrice(game.Price, discountPercent),
                DiscountPercent: discountPercent,
                DiscountActive: discountActive,
                DiscountEndsAt: discountActive ? discount!.EndDate : null,
                Genres: genres.Length > 0 ? genres : new[] { fallbackCategory },
                // Ключей ещё нет (например, игра не вышла) — показываем платформы из описания.
                Platforms: platformsByGameId.TryGetValue(gameId, out var keyPlatforms) && keyPlatforms.Length > 0
                    ? keyPlatforms
                    : BuildPlatformLabels(details?.Platforms),
                // Оценка есть только у игр с отзывами: ноль звёзд и «нет отзывов» — разные вещи.
                Rating: rating is null ? null : Math.Round(rating.Average, 1),
                ReviewCount: rating?.Count ?? 0,
                InStock: !stockKnown || keysAvailable > 0,
                LowStockLeft: stockKnown && keysAvailable > 0 && keysAvailable <= LowStockThreshold
                    ? keysAvailable
                    : null,
                ShowInFeaturedStorefront: details?.ShowInFeaturedStorefront ?? false,
                FeaturedStorefrontPriority: details?.FeaturedStorefrontPriority ?? int.MaxValue);
        }).ToList();
    }

    /// <summary>
    /// Названия категорий берём из настроек — их правит админка, и витрина показывает именно их.
    /// Индекс в массиве соответствует значению GameType.
    /// </summary>
    private async Task<Dictionary<int, string>> LoadCategoryTitlesAsync()
    {
        var titles = new Dictionary<int, string>();

        try
        {
            var settings = (await _settings.GetAllAsync()).FirstOrDefault();
            var categories = settings?.GameCategories ?? Array.Empty<GameCategory>();
            for (var index = 0; index < categories.Length; index++)
            {
                if (!string.IsNullOrWhiteSpace(categories[index]?.Title))
                {
                    titles[index] = categories[index].Title;
                }
            }
        }
        catch
        {
            // Настройки недоступны — останутся названия из статической карты типов.
        }

        return titles;
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
