using Microsoft.Extensions.Caching.Memory;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Категории софта из настроек — одно место, откуда их читают каталог, создание товара, снимок каталога и админка.
/// Как <see cref="GameGenreDirectory"/>: короткий кэш, сброс при сохранении списка в админке, пустые или
/// недоступные настройки — категории по умолчанию, категории без Tag отбрасываются.
/// </summary>
public interface ISoftwareCategoryDirectory
{
    Task<IReadOnlyList<GameCategory>> GetAsync();

    void Invalidate();
}

public sealed class SoftwareCategoryDirectory : ISoftwareCategoryDirectory
{
    public const string CacheKey = "catalog:software-categories";
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(5);

    private readonly ISettingsRepository _settings;
    private readonly IMemoryCache _cache;

    public SoftwareCategoryDirectory(ISettingsRepository settings, IMemoryCache cache)
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
                var stored = (await _settings.GetAllAsync()).FirstOrDefault()?.SoftwareCategories;
                var categories = (stored ?? Array.Empty<GameCategory>())
                    .Where(category => !string.IsNullOrWhiteSpace(category?.Tag))
                    .ToList();
                return categories.Count > 0 ? (IReadOnlyList<GameCategory>)categories : SoftwareCatalog.DefaultCategories;
            }
            catch
            {
                return SoftwareCatalog.DefaultCategories;
            }
        }) ?? SoftwareCatalog.DefaultCategories;

    public void Invalidate() => _cache.Remove(CacheKey);
}
