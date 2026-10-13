using Microsoft.Extensions.Caching.Memory;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Жанры игр из настроек — одно место, откуда их читают каталог, страница товара, sitemap и админка.
/// Кэш короткий и сбрасывается при сохранении списка в админке; пустые или недоступные настройки — жанры по умолчанию.
/// </summary>
public interface IGameGenreDirectory
{
    Task<IReadOnlyList<GameCategory>> GetAsync();

    void Invalidate();
}

public sealed class GameGenreDirectory : IGameGenreDirectory
{
    public const string CacheKey = "catalog:genres";
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(5);

    private readonly ISettingsRepository _settings;
    private readonly IMemoryCache _cache;

    public GameGenreDirectory(ISettingsRepository settings, IMemoryCache cache)
    {
        _settings = settings;
        _cache = cache;
    }

    public async Task<IReadOnlyList<GameCategory>> GetAsync() =>
        await _cache.GetOrCreateAsync(CacheKey, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = CacheTtl;
            try
            {
                var stored = (await _settings.GetAllAsync()).FirstOrDefault()?.GameCategories;
                var genres = (stored ?? Array.Empty<GameCategory>())
                    .Where(genre => !string.IsNullOrWhiteSpace(genre?.Tag))
                    .ToList();
                return genres.Count > 0 ? (IReadOnlyList<GameCategory>)genres : GameGenres.Defaults;
            }
            catch
            {
                return GameGenres.Defaults;
            }
        }) ?? GameGenres.Defaults;

    public void Invalidate() => _cache.Remove(CacheKey);
}
