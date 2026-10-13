using Microsoft.Extensions.Caching.Memory;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Services;

namespace SuperBot.WebApi.Services.Storefront;

/// <summary>Состав баннера «Deal of the week»: id героя и кулис, уже с учётом фолбэков.</summary>
public interface IDealSpotlightService
{
    Task<(string? HeroGameId, List<string> WingGameIds)> ResolveAsync();
}

/// <summary>
/// Кто попадает в баннер недели. Раньше это жило приватным методом контроллера, а главной
/// странице нужен тот же ответ — но карточками, а не идентификаторами: каталога у неё больше
/// нет, джойнить id стало не с чем.
/// </summary>
public sealed class DealSpotlightService : IDealSpotlightService
{
    /// <summary>Сколько обложек в «кулисах» баннера (по три с каждой стороны).</summary>
    public const int MaxWingGames = 6;

    /// <summary>
    /// Состав баннера одинаков для всех посетителей, поэтому кэш общий (ключ без пользователя).
    /// TTL короткий: правку в админке админ ожидает увидеть почти сразу, а не через 10 минут.
    /// При сохранении настроек кэш сбрасывается явно — см. DealOfWeekController.Update.
    /// </summary>
    public const string SpotlightCacheKey = "deal-of-week:spotlight";
    private static readonly TimeSpan SpotlightCacheTtl = TimeSpan.FromMinutes(2);

    private readonly IDealOfWeekSettingsRepository _settings;
    private readonly IGameRepository _games;
    private readonly IGameDiscountRepository _discounts;
    private readonly IMemoryCache _cache;

    public DealSpotlightService(
        IDealOfWeekSettingsRepository settings,
        IGameRepository games,
        IGameDiscountRepository discounts,
        IMemoryCache cache)
    {
        _settings = settings;
        _games = games;
        _discounts = discounts;
        _cache = cache;
    }

    /// <summary>Состав баннера с кэшем: один и тот же ответ для всех посетителей.</summary>
    public async Task<(string? HeroGameId, List<string> WingGameIds)> ResolveAsync()
    {
        var cached = await _cache.GetOrCreateAsync(SpotlightCacheKey, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = SpotlightCacheTtl;
            var resolved = await BuildAsync();
            return new Spotlight(resolved.HeroGameId, resolved.WingGameIds);
        }) ?? new Spotlight(null, new List<string>());

        return (cached.HeroGameId, cached.WingGameIds);
    }

    /// <summary>Именованный тип, а не кортеж: значение кладётся в кэш.</summary>
    private sealed record Spotlight(string? HeroGameId, List<string> WingGameIds);

    private async Task<(string? HeroGameId, List<string> WingGameIds)> BuildAsync()
    {
        var config = await _settings.GetAsync();
        var games = await _games.GetAllAsync();
        var utcNow = DateTime.UtcNow;

        var gameById = games
            .Where(game => !string.IsNullOrWhiteSpace(game.Id))
            .ToDictionary(game => game.Id!, StringComparer.OrdinalIgnoreCase);
        var discounts = await _discounts.GetByGameIdsAsync(gameById.Keys);
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
}
