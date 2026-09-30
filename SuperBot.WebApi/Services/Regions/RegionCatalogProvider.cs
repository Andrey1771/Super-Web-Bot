using System.Text.Json;
using Microsoft.Extensions.Options;
using SuperBot.Core.Regions;
using SuperBot.WebApi.Services.SiteSettings;

namespace SuperBot.WebApi.Services.Regions;

/// <summary>Регионы из конфига (`Storefront:Regions`). Пусто — зашитый дефолтный набор.</summary>
public sealed class RegionCatalogOptions
{
    public List<RegionDefinition> Regions { get; set; } = new();
}

/// <summary>
/// Текущий справочник регионов: настройки сайта (правит админ) → конфиг → дефолт. Снимок кэшируется
/// и пересобирается, когда меняются настройки, — справочник читается на каждой выдаче ключа.
/// </summary>
public sealed class RegionCatalogProvider : IRegionCatalogProvider
{
    private readonly IOptionsMonitor<RegionCatalogOptions> _options;
    private readonly SiteSettingsStore _settings;
    private RegionCatalog? _cached;
    private string? _cachedKey;

    public RegionCatalogProvider(IOptionsMonitor<RegionCatalogOptions> options, SiteSettingsStore settings)
    {
        _options = options;
        _settings = settings;
    }

    public RegionCatalog Current
    {
        get
        {
            var json = _settings.Current.RegionsJson;
            var key = json ?? $"cfg:{_options.CurrentValue.Regions.Count}";
            if (_cached is not null && _cachedKey == key)
            {
                return _cached;
            }
            _cached = Build(json, _options.CurrentValue);
            _cachedKey = key;
            return _cached;
        }
    }

    private static RegionCatalog Build(string? settingsJson, RegionCatalogOptions options)
    {
        if (!string.IsNullOrWhiteSpace(settingsJson))
        {
            try
            {
                var fromSettings = JsonSerializer.Deserialize<List<RegionDefinition>>(settingsJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                if (fromSettings is { Count: > 0 })
                {
                    return new RegionCatalog { Regions = Normalize(fromSettings) };
                }
            }
            catch (JsonException)
            {
                // Битый JSON в настройках — не роняем выдачу, откатываемся к конфигу/дефолту.
            }
        }
        if (options.Regions.Count > 0)
        {
            return new RegionCatalog { Regions = Normalize(options.Regions) };
        }
        return new RegionCatalog();
    }

    public static List<RegionDefinition> Normalize(IEnumerable<RegionDefinition> regions) =>
        regions
            .Where(r => !string.IsNullOrWhiteSpace(r.Code))
            .Select(r => new RegionDefinition
            {
                Code = r.Code.Trim().ToUpperInvariant(),
                Name = string.IsNullOrWhiteSpace(r.Name) ? r.Code.Trim().ToUpperInvariant() : r.Name.Trim(),
                Countries = (r.Countries ?? new()).Select(c => c?.Trim().ToUpperInvariant() ?? string.Empty).Where(c => c.Length == 2).Distinct().ToList()
            })
            .GroupBy(r => r.Code)
            .Select(g => g.First())
            .ToList();
}

/// <summary>
/// Страна покупателя для запроса. Порядок: то, что выбрал сам покупатель в шапке (`X-Buyer-Country`),
/// затем гео от CDN/прокси (`CF-IPCountry`, `X-Country`), затем `?country=`. Только ISO alpha-2.
/// </summary>
public static class BuyerCountry
{
    public static string? Resolve(HttpRequest request)
    {
        foreach (var header in new[] { "X-Buyer-Country", "CF-IPCountry", "X-Country" })
        {
            var value = request.Headers[header].ToString();
            if (IsCountry(value))
            {
                return value.Trim().ToUpperInvariant();
            }
        }
        var query = request.Query["country"].ToString();
        return IsCountry(query) ? query.Trim().ToUpperInvariant() : null;
    }

    /// <summary>Гео от CDN/прокси отдельно — чтобы предложить покупателю страну, пока он не выбрал свою.</summary>
    public static string? Detected(HttpRequest request)
    {
        foreach (var header in new[] { "CF-IPCountry", "X-Country" })
        {
            var value = request.Headers[header].ToString();
            if (IsCountry(value))
            {
                return value.Trim().ToUpperInvariant();
            }
        }
        return null;
    }

    private static bool IsCountry(string? value) =>
        !string.IsNullOrWhiteSpace(value) && value.Trim().Length == 2 && value.Trim().All(char.IsLetter) && !string.Equals(value.Trim(), "XX", StringComparison.OrdinalIgnoreCase);
}
