using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Regions;
using SuperBot.WebApi.Services.Regions;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Регион покупателя для витрины: определённая по гео страна (если прокси/CDN её передал),
/// список стран для переключателя в шапке и справочник регионов (для подписей «активируется в EU, NA»).
/// </summary>
[ApiController]
[Route("api/storefront/region")]
public class StorefrontRegionController : ControllerBase
{
    private static readonly Lazy<IReadOnlyList<CountryRow>> Countries = new(BuildCountries);
    private readonly IRegionCatalogProvider _regions;
    private readonly SuperBot.WebApi.Services.ICatalogSnapshotService _catalog;
    private readonly SuperBot.Core.Interfaces.IRepositories.IGameKeyRepository _keys;

    public StorefrontRegionController(
        IRegionCatalogProvider regions,
        SuperBot.WebApi.Services.ICatalogSnapshotService catalog,
        SuperBot.Core.Interfaces.IRepositories.IGameKeyRepository keys)
    {
        _regions = regions;
        _catalog = catalog;
        _keys = keys;
    }

    public sealed class RegionCheckRequest
    {
        public List<string> GameIds { get; set; } = new();
    }

    public sealed record CountryRow(string Code, string Name);

    [AllowAnonymous]
    [HttpGet]
    public IActionResult Get()
    {
        var catalog = _regions.Current;
        return Ok(new
        {
            // Что выбрал покупатель (заголовок от фронта) или что определил прокси; null — не знаем.
            buyerCountry = BuyerCountry.Resolve(Request),
            detectedCountry = BuyerCountry.Detected(Request),
            countries = Countries.Value,
            regions = catalog.Regions.Select(r => new { code = r.Code, name = r.Name, countries = r.Countries })
        });
    }

    /// <summary>
    /// Регионы для товаров в корзине: где активируется каждый ключ и подходит ли он покупателю.
    ///
    /// Отдельным запросом, а не полем позиции корзины: корзина хранится в браузере, и записанный
    /// в неё регион устареет в тот же день, когда магазин поменяет политику игры. Здесь ответ
    /// всегда свежий, а страна берётся из того же заголовка, что и везде.
    /// </summary>
    [AllowAnonymous]
    [HttpPost("check")]
    public async Task<IActionResult> Check([FromBody] RegionCheckRequest request)
    {
        var ids = (request?.GameIds ?? new List<string>())
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(100)
            .ToList();

        if (ids.Count == 0)
        {
            return Ok(new { buyerCountry = BuyerCountry.Resolve(Request), items = Array.Empty<object>() });
        }

        var snapshot = await _catalog.GetAsync();
        var catalog = _regions.Current;
        var buyerCountry = BuyerCountry.Resolve(Request);

        var byId = snapshot
            .Where(item => ids.Contains(item.Id, StringComparer.OrdinalIgnoreCase))
            .ToDictionary(item => item.Id, StringComparer.OrdinalIgnoreCase);

        // Площадка активации и наличие — со склада: у одной игры ключи могут быть и Steam,
        // и Epic Games, и покупателю важно знать, какой из них он получит.
        var activation = await _keys.GetActivationInfoAsync(ids);

        var items = ids.Select(id =>
        {
            // Игры нет в каталоге (снята с продажи) — молчим о регионе, а не выдумываем «везде».
            if (!byId.TryGetValue(id, out var item))
            {
                return new
                {
                    gameId = id,
                    known = false,
                    badge = (string?)null,
                    summary = (string?)null,
                    exclusions = (string?)null,
                    kind = (string?)null,
                    regionNames = (IReadOnlyList<string>)Array.Empty<string>(),
                    excludedCountries = (IReadOnlyList<string>)Array.Empty<string>(),
                    allowed = (bool?)null,
                    platforms = (IReadOnlyList<string>)Array.Empty<string>(),
                    inStock = (bool?)null
                };
            }

            activation.TryGetValue(id, out var keys);
            // Судим по политикам партий: магазин мог ограничить регион у самих ключей, не трогая игру.
            var summary = SuperBot.WebApi.Services.Regions.RegionSummary.BuildForKeys(
                keys?.KeyPolicies, item.RegionPolicy, catalog, buyerCountry);
            return new
            {
                gameId = id,
                known = true,
                badge = summary.IsRestricted ? summary.Badge : null,
                summary = summary.IsRestricted ? summary.Summary : null,
                exclusions = summary.Exclusions,
                // Код и списки для перевода на витрине; у товара без ограничений kind тоже пуст —
                // как и badge, чтобы строка региона в корзине не появлялась на пустом месте.
                kind = summary.IsRestricted ? summary.Kind : null,
                regionNames = summary.RegionNames,
                excludedCountries = summary.ExcludedCountries,
                allowed = summary.Allowed,
                // Пусто — ключей на складе нет, и называть площадку не из чего.
                platforms = keys?.Platforms ?? (IReadOnlyList<string>)Array.Empty<string>(),
                inStock = (bool?)((keys?.Available ?? 0) > 0)
            };
        });

        return Ok(new { buyerCountry, items });
    }

    /// <summary>Страны ISO-3166-1 alpha-2 с английскими названиями — из данных .NET, без ручного списка.</summary>
    private static IReadOnlyList<CountryRow> BuildCountries()
    {
        var rows = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var culture in CultureInfo.GetCultures(CultureTypes.SpecificCultures))
        {
            try
            {
                var region = new RegionInfo(culture.Name);
                var code = region.TwoLetterISORegionName;
                if (code.Length == 2 && code.All(char.IsLetter) && !rows.ContainsKey(code))
                {
                    rows[code] = region.EnglishName;
                }
            }
            catch (ArgumentException)
            {
                // Культуры без региона (например, нейтральные) — пропускаем.
            }
        }
        return rows.Select(pair => new CountryRow(pair.Key.ToUpperInvariant(), pair.Value)).OrderBy(row => row.Name, StringComparer.Ordinal).ToList();
    }
}
