using System.Text;
using SuperBot.WebApi.Controllers;

namespace SuperBot.WebApi.Services;

/// <summary>Запрос витрины к каталогу: что показать, в каком порядке и какой страницей.</summary>
public sealed record CatalogQueryOptions(
    string? Search,
    IReadOnlyList<string> Categories,
    /// <summary>
    /// Категория подстрокой — так её передают ссылки витрины («RPG» попадает
    /// в «Role-Playing Games (RPGs)»). Работает, только пока не выбран точный список:
    /// первый же клик по фильтру заменяет подстроку на конкретные названия.
    /// </summary>
    string? CategoryQuery,
    /// <summary>
    /// Категория адресом страницы — так её задаёт посадочная страница жанра
    /// (`/games/category/action`). Сравнивается по тому же slug, что строит витрина.
    /// </summary>
    string? CategorySlug,
    IReadOnlyList<string> Platforms,
    decimal? MinPrice,
    decimal? MaxPrice,
    bool OnSaleOnly,
    bool InStockOnly,
    bool ComingSoonOnly,
    string Sort,
    int Page,
    int PageSize);

/// <summary>Вариант фильтра и число результатов, которое он даст.</summary>
public sealed record FacetCount(string Value, int Count);

public sealed record AvailabilityFacets(int InStock, int OnSale, int ComingSoon);

/// <summary>Столбик гистограммы цен: сколько игр стоит от <paramref name="From"/> до <paramref name="To"/>.</summary>
public sealed record PriceBucket(decimal From, decimal To, int Count);

/// <summary>
/// Готовый диапазон цены одним кликом. <c>To == null</c> — верхней границы нет («от $50»).
/// </summary>
public sealed record PricePreset(string Label, decimal From, decimal? To, int Count);

public sealed record CatalogFacets(
    IReadOnlyList<FacetCount> Categories,
    IReadOnlyList<FacetCount> Platforms,
    AvailabilityFacets Availability,
    IReadOnlyList<PriceBucket> PriceHistogram,
    IReadOnlyList<PricePreset> PricePresets);

public sealed record PriceBounds(decimal Min, decimal Max);

public sealed record CatalogPage(
    IReadOnlyList<CatalogItem> Items,
    int Total,
    int Page,
    int PageSize,
    PriceBounds PriceRange,
    CatalogFacets Facets);

/// <summary>
/// Отбор, сортировка и разбиение каталога на страницы.
///
/// Логика вынесена из контроллера и не зависит ни от базы, ни от HTTP: на входе готовый
/// список позиций, на выходе — страница выдачи. Это то место, где легче всего ошибиться
/// незаметно, поэтому его удобно проверять напрямую.
/// </summary>
public static class CatalogQuery
{
    public const int DefaultPageSize = 24;
    public const int MaxPageSize = 48;

    /// <summary>Порядок по умолчанию — по продажам за неделю.</summary>
    public const string DefaultSort = "popular";

    public static CatalogPage Apply(
        IReadOnlyList<CatalogItem> catalog,
        CatalogQueryOptions options,
        IReadOnlyDictionary<string, int> popularityRank)
    {
        // Границы ползунка цены считаем по всему каталогу, а не по выдаче: иначе
        // выбор диапазона сжимал бы сам ползунок и вернуть его обратно было бы нельзя.
        var priceRange = BuildPriceBounds(catalog);
        var predicates = BuildPredicates(options);

        var matching = catalog.Where(item => predicates.Values.All(predicate => predicate(item))).ToList();
        var total = matching.Count;

        var pageSize = Math.Clamp(options.PageSize, 1, MaxPageSize);
        var lastPage = Math.Max(1, (int)Math.Ceiling(total / (double)pageSize));
        var page = Math.Clamp(options.Page, 1, lastPage);

        var items = Sort(matching, options.Sort, popularityRank)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToList();

        return new CatalogPage(
            items,
            total,
            page,
            pageSize,
            priceRange,
            BuildFacets(catalog, predicates, priceRange));
    }

    // ---------- отбор ----------

    /// <summary>
    /// Каждое условие живёт под своим именем: чтобы посчитать, сколько даст вариант фильтра,
    /// выдача пересобирается со всеми условиями, КРОМЕ его собственного. Иначе выбранная
    /// категория обнулила бы счётчики всех остальных, и добавить вторую было бы нельзя.
    /// </summary>
    private static Dictionary<string, Func<CatalogItem, bool>> BuildPredicates(CatalogQueryOptions options)
    {
        var searchTokens = Tokenize(options.Search);
        var categories = new HashSet<string>(options.Categories ?? Array.Empty<string>(), StringComparer.OrdinalIgnoreCase);
        var platforms = new HashSet<string>(options.Platforms ?? Array.Empty<string>(), StringComparer.OrdinalIgnoreCase);

        return new Dictionary<string, Func<CatalogItem, bool>>
        {
            ["search"] = item => searchTokens.Count == 0 || Matches(item, searchTokens),
            ["category"] = item =>
            {
                // Адрес посадочной страницы жанра сильнее выбора в сайдбаре: он определяет,
                // что это вообще за страница, и снять его галочкой нельзя.
                if (!string.IsNullOrWhiteSpace(options.CategorySlug))
                {
                    return string.Equals(
                        SeoController.Slugify(item.Category),
                        options.CategorySlug,
                        StringComparison.OrdinalIgnoreCase);
                }

                if (categories.Count > 0)
                {
                    return categories.Contains(item.Category);
                }

                return string.IsNullOrWhiteSpace(options.CategoryQuery) ||
                       item.Category.Contains(options.CategoryQuery, StringComparison.OrdinalIgnoreCase);
            },
            ["platform"] = item => platforms.Count == 0 || item.Platforms.Any(platforms.Contains),
            ["price"] = item =>
                (options.MinPrice is null || item.FinalPrice >= options.MinPrice) &&
                (options.MaxPrice is null || item.FinalPrice <= options.MaxPrice),
            ["onSale"] = item => !options.OnSaleOnly || item.DiscountActive,
            ["inStock"] = item => !options.InStockOnly || item.InStock,
            ["comingSoon"] = item => !options.ComingSoonOnly || item.IsComingSoon
        };
    }

    // ---------- поиск ----------

    /// <summary>
    /// Приводит строку к сравнимому виду: только буквы и цифры в нижнем регистре.
    /// Благодаря этому «Baldur's Gate 3» находится и по «baldurs gate», и по «Baldur’s»
    /// с любым видом апострофа, и по «BALDURS GATE3».
    /// </summary>
    private static string Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var builder = new StringBuilder(value.Length);
        foreach (var symbol in value)
        {
            if (char.IsLetterOrDigit(symbol))
            {
                builder.Append(char.ToLowerInvariant(symbol));
            }
        }

        return builder.ToString();
    }

    private static List<string> Tokenize(string? search) =>
        (search ?? string.Empty)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(Normalize)
            .Where(token => token.Length > 0)
            .ToList();

    /// <summary>
    /// Совпадение — когда КАЖДОЕ слово запроса нашлось. Слова проверяются независимо,
    /// поэтому порядок ввода значения не имеет: «ring elden» находит «Elden Ring».
    /// </summary>
    private static bool Matches(CatalogItem item, List<string> tokens)
    {
        var haystack = string.Join(
            ' ',
            Normalize(item.Title),
            Normalize(item.Name),
            Normalize(item.Slug));

        return tokens.All(token => haystack.Contains(token, StringComparison.Ordinal));
    }

    // ---------- порядок ----------

    private static IEnumerable<CatalogItem> Sort(
        List<CatalogItem> items,
        string sort,
        IReadOnlyDictionary<string, int> popularityRank) =>
        sort switch
        {
            "price-asc" => items.OrderBy(item => item.FinalPrice).ThenBy(item => item.Title),
            "price-desc" => items.OrderByDescending(item => item.FinalPrice).ThenBy(item => item.Title),
            "name-asc" => items.OrderBy(item => item.Title, StringComparer.OrdinalIgnoreCase),
            "name-desc" => items.OrderByDescending(item => item.Title, StringComparer.OrdinalIgnoreCase),
            "rating" => items
                // Игры без отзывов уходят вниз: у них не низкая оценка, у них её нет.
                .OrderByDescending(item => item.Rating ?? -1)
                .ThenByDescending(item => item.ReviewCount)
                .ThenBy(item => item.Title),
            "discount" => items
                // Считаем только действующую скидку: процент от закончившейся акции
                // поднял бы наверх товар, который сейчас продаётся по полной цене.
                .OrderByDescending(item => item.DiscountActive ? item.DiscountPercent ?? 0 : 0)
                .ThenBy(item => item.FinalPrice)
                .ThenBy(item => item.Title),
            "reviews" => items
                .OrderByDescending(item => item.ReviewCount)
                .ThenByDescending(item => item.Rating ?? -1)
                .ThenBy(item => item.Title),
            "new" => items.OrderByDescending(item => item.ReleaseDate).ThenBy(item => item.Title),
            _ => items
                // Непроданное за неделю уходит вниз общей группой и внутри неё
                // упорядочивается по названию — иначе порядок выглядел бы случайным.
                .OrderBy(item => popularityRank.TryGetValue(item.Id, out var rank) ? rank : int.MaxValue)
                .ThenBy(item => item.Title, StringComparer.OrdinalIgnoreCase)
        };

    // ---------- счётчики ----------

    private static CatalogFacets BuildFacets(
        IReadOnlyList<CatalogItem> catalog,
        Dictionary<string, Func<CatalogItem, bool>> predicates,
        PriceBounds priceRange)
    {
        int CountExcept(string facet, Func<CatalogItem, bool> candidate) =>
            catalog.Count(item =>
                predicates.Where(pair => pair.Key != facet).All(pair => pair.Value(item)) && candidate(item));

        var categories = catalog
            .Select(item => item.Category)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(category => category, StringComparer.OrdinalIgnoreCase)
            .Select(category => new FacetCount(
                category,
                CountExcept("category", item => string.Equals(item.Category, category, StringComparison.OrdinalIgnoreCase))))
            .ToList();

        var platforms = catalog
            .SelectMany(item => item.Platforms)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(platform => platform, StringComparer.OrdinalIgnoreCase)
            .Select(platform => new FacetCount(
                platform,
                CountExcept("platform", item => item.Platforms.Contains(platform, StringComparer.OrdinalIgnoreCase))))
            .ToList();

        var availability = new AvailabilityFacets(
            CountExcept("inStock", item => item.InStock),
            CountExcept("onSale", item => item.DiscountActive),
            CountExcept("comingSoon", item => item.IsComingSoon));

        // Гистограмма строится БЕЗ учёта самого ценового фильтра: она показывает, где вообще
        // лежит товар, и по ней выбирают диапазон. Схлопнись она до выбранного участка —
        // пользоваться ползунком стало бы невозможно.
        var pricedItems = catalog
            .Where(item => predicates.Where(pair => pair.Key != "price").All(pair => pair.Value(item)))
            .Select(item => item.FinalPrice)
            .ToList();

        var presets = PricePresetRanges
            .Select(preset => new PricePreset(
                preset.Label,
                preset.From,
                preset.To,
                pricedItems.Count(price => price >= preset.From && (preset.To is null || price < preset.To))))
            // Диапазон без товара показывать незачем: клик по нему привёл бы в пустоту.
            .Where(preset => preset.Count > 0)
            .ToList();

        return new CatalogFacets(
            categories,
            platforms,
            availability,
            BuildPriceHistogram(pricedItems, priceRange),
            presets);
    }

    /// <summary>
    /// Готовые ценовые диапазоны для фильтра. Границы фиксированные, а не вычисленные из
    /// каталога: «до $10» — понятная покупателю величина, а подпись вроде «до $13.40»,
    /// которая меняется от завоза к завозу, ни о чём не говорит и ломает сохранённые ссылки.
    ///
    /// Верхняя граница НЕ включается в диапазон (кроме последнего, открытого), иначе игра
    /// ровно за $10 попадала бы сразу в два.
    /// </summary>
    private static readonly (string Label, decimal From, decimal? To)[] PricePresetRanges =
    [
        ("Under $10", 0m, 10m),
        ("$10 – $25", 10m, 25m),
        ("$25 – $50", 25m, 50m),
        ("$50 and up", 50m, null)
    ];

    /// <summary>Сколько столбиков рисуем: достаточно, чтобы увидеть форму, и не превратиться в гребёнку.</summary>
    private const int PriceHistogramBuckets = 24;

    private static IReadOnlyList<PriceBucket> BuildPriceHistogram(List<decimal> prices, PriceBounds range)
    {
        var span = range.Max - range.Min;
        if (prices.Count == 0 || span <= 0)
        {
            return Array.Empty<PriceBucket>();
        }

        var step = span / PriceHistogramBuckets;
        var counts = new int[PriceHistogramBuckets];

        foreach (var price in prices)
        {
            // Верхнюю границу кладём в последний столбик, иначе самая дорогая игра
            // выпала бы за пределы массива.
            var index = (int)((price - range.Min) / step);
            counts[Math.Clamp(index, 0, PriceHistogramBuckets - 1)]++;
        }

        return counts
            .Select((count, index) => new PriceBucket(
                Math.Round(range.Min + step * index, 2),
                Math.Round(range.Min + step * (index + 1), 2),
                count))
            .ToList();
    }

    private static PriceBounds BuildPriceBounds(IReadOnlyList<CatalogItem> catalog)
    {
        if (catalog.Count == 0)
        {
            return new PriceBounds(0, 0);
        }

        return new PriceBounds(
            Math.Floor(catalog.Min(item => item.FinalPrice)),
            Math.Ceiling(catalog.Max(item => item.FinalPrice)));
    }
}
