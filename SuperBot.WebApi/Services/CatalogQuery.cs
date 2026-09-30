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
    int PageSize,
    /// <summary>Точное имя студии или издателя — ссылка «ещё игры студии» со страницы товара.</summary>
    string? Studio = null,
    /// <summary>Тег из карточки игры (точное совпадение без учёта регистра).</summary>
    string? Tag = null,
    /// <summary>Показывать ли DLC в общем списке. По умолчанию — нет: DLC живут в блоке базовой игры.</summary>
    bool IncludeDlc = false,
    /// <summary>
    /// Вид товара: каталог показывает игры или софт (?type=software). По умолчанию — игры: все прежние ссылки и полки
    /// витрины были про игры, и ПО не должно в них просочиться. null — оба вида (общий поиск).
    /// </summary>
    SuperBot.Core.Entities.ProductKind? Kind = SuperBot.Core.Entities.ProductKind.Game,
    /// <summary>Категория софта (Tag) — из адреса (?softwareCategory=), как CategorySlug у жанров.</summary>
    string? SoftwareCategory = null,
    /// <summary>Сроки лицензии: «12», «24», «lifetime» (<see cref="SuperBot.Core.Entities.SoftwareCatalog.TermKey"/>).</summary>
    IReadOnlyList<string>? LicenseTerms = null,
    /// <summary>Число устройств: «1», «3», «10+» (<see cref="SuperBot.Core.Entities.SoftwareCatalog.DevicesKey"/>).</summary>
    IReadOnlyList<string>? Devices = null,
    /// <summary>Где активируется: имена <see cref="SuperBot.Core.Entities.SoftwareActivationTarget"/>.</summary>
    IReadOnlyList<string>? Activation = null);

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
    IReadOnlyList<PricePreset> PricePresets,
    /// <summary>Фильтры ПО. У игр пустые: у них нет лицензий, категорий раздела и места активации.</summary>
    SoftwareFacets Software,
    /// <summary>Сколько совпадений по поиску у каждого вида — чтобы Enter в общем поиске вёл туда, где их больше.</summary>
    IReadOnlyList<FacetCount> Kinds);

public sealed record SoftwareFacets(
    IReadOnlyList<FacetCount> Categories,
    IReadOnlyList<FacetCount> LicenseTerms,
    IReadOnlyList<FacetCount> Devices,
    IReadOnlyList<FacetCount> Activation)
{
    public static SoftwareFacets Empty { get; } = new(Array.Empty<FacetCount>(), Array.Empty<FacetCount>(), Array.Empty<FacetCount>(), Array.Empty<FacetCount>());
}

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
        var kinds = CountKinds(catalog, options);
        catalog = Scope(catalog, options);

        // Границы ползунка цены считаем по всему разделу, а не по выдаче: иначе
        // выбор диапазона сжимал бы сам ползунок и вернуть его обратно было бы нельзя.
        var priceRange = BuildPriceBounds(catalog);
        var predicates = BuildPredicates(options);
        // Каждое условие проверяется на позиции один раз; выдача и все счётчики фасетов читают готовую маску.
        var masks = new PredicateMasks(catalog, predicates);

        var matching = masks.Matching();
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
            BuildFacets(catalog, masks, priceRange, options, kinds));
    }

    /// <summary>
    /// Раздел, в котором идёт поиск: товары нужного вида, а у ПО — с ценой самой дешёвой лицензии из подходящих
    /// под фильтры срока и устройств. Отбор, сортировка и ценовой фильтр дальше работают уже по этой цене.
    /// </summary>
    private static IReadOnlyList<CatalogItem> Scope(IReadOnlyList<CatalogItem> catalog, CatalogQueryOptions options)
    {
        var inKind = options.Kind is { } kind ? catalog.Where(item => item.Kind == kind) : catalog;
        var license = LicenseMatcher(options);
        return license is null
            ? inKind as IReadOnlyList<CatalogItem> ?? inKind.ToList()
            : inKind.Select(item => SoftwareLicenses.Represent(item, license)).ToList();
    }

    /// <summary>Подходит ли лицензия под фильтры срока и устройств; null — фильтров нет.</summary>
    private static Func<CatalogLicense, bool>? LicenseMatcher(CatalogQueryOptions options, bool ignoreTerms = false, bool ignoreDevices = false)
    {
        var terms = ignoreTerms ? null : ToSet(options.LicenseTerms);
        var devices = ignoreDevices ? null : ToSet(options.Devices);
        if (terms is null && devices is null)
        {
            return null;
        }

        return license =>
            (terms is null || terms.Contains(SuperBot.Core.Entities.SoftwareCatalog.TermKey(license.TermMonths, license.IsSubscription) ?? string.Empty)) &&
            (devices is null || devices.Contains(SuperBot.Core.Entities.SoftwareCatalog.DevicesKey(license.Devices) ?? string.Empty));
    }

    private static HashSet<string>? ToSet(IReadOnlyList<string>? values)
    {
        var set = new HashSet<string>((values ?? Array.Empty<string>()).Where(value => !string.IsNullOrWhiteSpace(value)), StringComparer.OrdinalIgnoreCase);
        return set.Count == 0 ? null : set;
    }

    /// <summary>Совпадения поиска по видам товара — без фильтров раздела, они у видов разные.</summary>
    private static IReadOnlyList<FacetCount> CountKinds(IReadOnlyList<CatalogItem> catalog, CatalogQueryOptions options)
    {
        var predicates = BuildPredicates(options);
        return Enum.GetValues<SuperBot.Core.Entities.ProductKind>()
            .Select(kind => new FacetCount(kind.ToString(), catalog.Count(item =>
                item.Kind == kind && predicates["search"](item) && predicates["dlc"](item))))
            .ToList();
    }

    /// <summary>
    /// Сколько строк даст этот запрос. Ни страницы, ни сортировки, ни фасетов — только счёт.
    ///
    /// Нужен подписям ссылок витрины («All 9 deals»): подпись обещает, сколько человек
    /// увидит после перехода, поэтому считать её другим условием, чем считает саму выдачу,
    /// нельзя — разойдутся. Отбор здесь тот же самый, <see cref="BuildPredicates"/>.
    /// </summary>
    public static int Count(IReadOnlyList<CatalogItem> catalog, CatalogQueryOptions options)
    {
        var predicates = BuildPredicates(options);
        return Scope(catalog, options).Count(item => predicates.Values.All(predicate => predicate(item)));
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
        var license = LicenseMatcher(options);
        var activation = ToSet(options.Activation);

        return new Dictionary<string, Func<CatalogItem, bool>>
        {
            ["search"] = item => searchTokens.Count == 0 || Matches(item, searchTokens),
            ["category"] = item =>
            {
                // Жанровый фильтр — про игры. У ПО «категория» — раздел софта, и выбранный жанр его исключает.
                if (item.Kind == SuperBot.Core.Entities.ProductKind.Software)
                {
                    return string.IsNullOrWhiteSpace(options.CategorySlug)
                        && categories.Count == 0
                        && string.IsNullOrWhiteSpace(options.CategoryQuery);
                }

                // Адрес посадочной страницы жанра сильнее выбора в сайдбаре: он определяет,
                // что это вообще за страница, и снять его галочкой нельзя.
                if (!string.IsNullOrWhiteSpace(options.CategorySlug))
                {
                    // Адрес жанра — его код: он не меняется при переименовании. Slug названия тоже принимаем — так
                    // строятся ссылки из названий (подвал, теги на странице товара), и они продолжают открываться.
                    return string.Equals(item.Genre, options.CategorySlug, StringComparison.OrdinalIgnoreCase)
                        || string.Equals(SeoController.Slugify(item.Category), options.CategorySlug, StringComparison.OrdinalIgnoreCase);
                }

                if (categories.Count > 0)
                {
                    return categories.Contains(item.Category);
                }

                return string.IsNullOrWhiteSpace(options.CategoryQuery) ||
                       item.Category.Contains(options.CategoryQuery, StringComparison.OrdinalIgnoreCase);
            },
            // В общем каталоге платформы — игровые (PC, PlayStation…); системы ПО живут в режиме софта («Works on»).
            // Иначе «Linux» из общего списка подтягивал бы и игры, и программы, а «Windows» стоял бы рядом с «PC».
            ["platform"] = item => platforms.Count == 0
                || ((options.Kind is not null || item.Kind != SuperBot.Core.Entities.ProductKind.Software) && item.Platforms.Any(platforms.Contains)),
            ["price"] = item =>
                (options.MinPrice is null || item.FinalPrice >= options.MinPrice) &&
                (options.MaxPrice is null || item.FinalPrice <= options.MaxPrice),
            // «Со скидкой» — это ВИДИМАЯ скидка, а не просто включённая акция: заведённая
            // на ноль процентов или не опустившая цену не показывает покупателю ничего.
            // Правило одно на весь магазин — по нему считаются и витрина скидок, и счётчик
            // фильтра, и число в подписи ссылки; будь их два, страница и её же счётчик
            // разошлись бы на одну игру, и понять почему было бы нечем.
            ["onSale"] = item => !options.OnSaleOnly || IsOnSale(item),
            ["inStock"] = item => !options.InStockOnly || item.InStock,
            ["comingSoon"] = item => !options.ComingSoonOnly || item.IsComingSoon,
            ["studio"] = item => string.IsNullOrWhiteSpace(options.Studio)
                || string.Equals(item.Developer, options.Studio, StringComparison.OrdinalIgnoreCase)
                || string.Equals(item.Publisher, options.Studio, StringComparison.OrdinalIgnoreCase),
            ["tag"] = item => string.IsNullOrWhiteSpace(options.Tag)
                || (item.Tags?.Any(tag => string.Equals(tag, options.Tag, StringComparison.OrdinalIgnoreCase)) ?? false),
            ["dlc"] = item => options.IncludeDlc || item.ParentGameId is null,
            ["softwareCategory"] = item => string.IsNullOrWhiteSpace(options.SoftwareCategory)
                || string.Equals(item.SoftwareCategory, options.SoftwareCategory, StringComparison.OrdinalIgnoreCase),
            // Срок и устройства проверяются на ОДНОЙ лицензии: «1 year» у одной и «3 devices» у другой — не совпадение.
            ["license"] = item => license is null || (item.Licenses?.Any(license) ?? false),
            ["activation"] = item => activation is null
                || (item.Activation is { } target && activation.Contains(target.ToString()))
        };
    }

    /// <summary>Скидка, которую покупатель действительно видит на карточке.</summary>
    public static bool IsOnSale(CatalogItem item) =>
        item.DiscountActive && (item.DiscountPercent ?? 0) > 0 && item.FinalPrice < item.Price;

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
    /// <summary>Строка, по которой ищется позиция: название, имя и slug в сравнимом виде. Снимок считает её заранее.</summary>
    public static string SearchText(string? title, string? name, string? slug) =>
        string.Join(' ', Normalize(title), Normalize(name), Normalize(slug));

    private static bool Matches(CatalogItem item, List<string> tokens)
    {
        var haystack = item.SearchText ?? SearchText(item.Title, item.Name, item.Slug);
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
            // Скидки, у которых меньше всего времени. Бессрочные уходят вниз общей группой:
            // "скоро закончится" про них ничего не говорит, но и выбрасывать их из выдачи
            // порядок не вправе — это дело фильтра.
            "ending-soon" => items
                .OrderBy(item => item.DiscountActive && item.DiscountEndsAt.HasValue ? 0 : 1)
                .ThenBy(item => item.DiscountEndsAt ?? DateTime.MaxValue)
                .ThenByDescending(item => item.DiscountPercent ?? 0)
                .ThenBy(item => item.Title),
            _ => items
                // Непроданное за месяц уходит вниз общей группой: там сначала то, что в наличии и с лучшим
                // рейтингом, потом по названию — иначе в тихую неделю «Most popular» выглядел бы как алфавит.
                .OrderBy(item => popularityRank.TryGetValue(item.Id, out var rank) ? rank : int.MaxValue)
                .ThenByDescending(item => item.InStock)
                .ThenByDescending(item => item.Rating ?? 0)
                .ThenByDescending(item => item.ReviewCount)
                .ThenBy(item => item.Title, StringComparer.OrdinalIgnoreCase)
        };

    // ---------- счётчики ----------

    private static CatalogFacets BuildFacets(
        IReadOnlyList<CatalogItem> catalog,
        PredicateMasks masks,
        PriceBounds priceRange,
        CatalogQueryOptions options,
        IReadOnlyList<FacetCount> kinds)
    {
        int CountExcept(string facet, Func<CatalogItem, bool> candidate) => masks.CountExcept(facet, candidate);

        // Фасет жанров — только по играм: разделы ПО живут в своём фасете (software.categories).
        var categories = catalog
            .Where(item => item.Kind != SuperBot.Core.Entities.ProductKind.Software)
            .Select(item => item.Category)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(category => category, StringComparer.OrdinalIgnoreCase)
            .Select(category => new FacetCount(
                category,
                CountExcept("category", item => string.Equals(item.Category, category, StringComparison.OrdinalIgnoreCase))))
            .ToList();

        var platforms = catalog
            .Where(item => options.Kind is not null || item.Kind != SuperBot.Core.Entities.ProductKind.Software)
            .SelectMany(item => item.Platforms)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(platform => platform, StringComparer.OrdinalIgnoreCase)
            .Select(platform => new FacetCount(
                platform,
                CountExcept("platform", item => (options.Kind is not null || item.Kind != SuperBot.Core.Entities.ProductKind.Software) && item.Platforms.Contains(platform, StringComparer.OrdinalIgnoreCase))))
            .ToList();

        var availability = new AvailabilityFacets(
            CountExcept("inStock", item => item.InStock),
            CountExcept("onSale", IsOnSale),
            CountExcept("comingSoon", item => item.IsComingSoon));

        // Гистограмма строится БЕЗ учёта самого ценового фильтра: она показывает, где вообще
        // лежит товар, и по ней выбирают диапазон. Схлопнись она до выбранного участка —
        // пользоваться ползунком стало бы невозможно.
        var pricedItems = masks.Except("price").Select(item => item.FinalPrice).ToList();

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
            presets,
            BuildSoftwareFacets(catalog, CountExcept, options),
            kinds);
    }

    private static SoftwareFacets BuildSoftwareFacets(
        IReadOnlyList<CatalogItem> catalog,
        Func<string, Func<CatalogItem, bool>, int> countExcept,
        CatalogQueryOptions options)
    {
        var software = catalog.Where(item => item.Kind == SuperBot.Core.Entities.ProductKind.Software).ToList();
        if (software.Count == 0)
        {
            return SoftwareFacets.Empty;
        }

        // Порядок категорий задают настройки (витрина сопоставляет по Tag), здесь — только счёт.
        var categories = software
            .Select(item => item.SoftwareCategory)
            .Where(tag => !string.IsNullOrWhiteSpace(tag))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(tag => new FacetCount(tag!, countExcept("softwareCategory",
                item => string.Equals(item.SoftwareCategory, tag, StringComparison.OrdinalIgnoreCase))))
            .ToList();

        var licenses = software.SelectMany(item => item.Licenses ?? Array.Empty<CatalogLicense>()).ToList();

        // Счётчик срока — при выбранных устройствах, и наоборот: оба фильтра смотрят на одну и ту же лицензию.
        var byDevices = LicenseMatcher(options, ignoreTerms: true);
        var terms = licenses
            .Select(license => (Key: SuperBot.Core.Entities.SoftwareCatalog.TermKey(license.TermMonths, license.IsSubscription), license.TermMonths))
            .Where(term => term.Key is not null)
            .DistinctBy(term => term.Key, StringComparer.OrdinalIgnoreCase)
            // Бессрочные — в конце: «1 month, 1 year, 2 years, Lifetime».
            .OrderBy(term => term.TermMonths ?? int.MaxValue)
            .Select(term => new FacetCount(term.Key!, countExcept("license", item => item.Licenses?.Any(license =>
                string.Equals(SuperBot.Core.Entities.SoftwareCatalog.TermKey(license.TermMonths, license.IsSubscription), term.Key, StringComparison.OrdinalIgnoreCase)
                && (byDevices is null || byDevices(license))) ?? false)))
            .ToList();

        var byTerms = LicenseMatcher(options, ignoreDevices: true);
        var devices = licenses
            .Select(license => (Key: SuperBot.Core.Entities.SoftwareCatalog.DevicesKey(license.Devices), Order: Math.Min(license.Devices ?? 0, SuperBot.Core.Entities.SoftwareCatalog.ManyDevices)))
            .Where(device => device.Key is not null)
            .DistinctBy(device => device.Key, StringComparer.OrdinalIgnoreCase)
            .OrderBy(device => device.Order)
            .Select(device => new FacetCount(device.Key!, countExcept("license", item => item.Licenses?.Any(license =>
                string.Equals(SuperBot.Core.Entities.SoftwareCatalog.DevicesKey(license.Devices), device.Key, StringComparison.OrdinalIgnoreCase)
                && (byTerms is null || byTerms(license))) ?? false)))
            .ToList();

        var activation = software
            .Where(item => item.Activation is not null)
            .Select(item => item.Activation!.Value)
            .Distinct()
            .OrderBy(target => target)
            .Select(target => new FacetCount(target.ToString(), countExcept("activation", item => item.Activation == target)))
            .ToList();

        return new SoftwareFacets(categories, terms, devices, activation);
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

    /// <summary>
    /// Итоги всех условий по каждой позиции — битовая маска, посчитанная один раз на запрос. Раньше каждый вариант
    /// каждого фасета (жанр, платформа, срок, устройства…) заново прогонял все условия по всему каталогу: десятки
    /// проходов на запрос, и на тысячах позиций это стало бы заметно.
    /// </summary>
    private sealed class PredicateMasks
    {
        private readonly IReadOnlyList<CatalogItem> _catalog;
        private readonly string[] _names;
        private readonly int[] _masks;
        private readonly int _all;

        public PredicateMasks(IReadOnlyList<CatalogItem> catalog, Dictionary<string, Func<CatalogItem, bool>> predicates)
        {
            if (predicates.Count > 31)
            {
                throw new InvalidOperationException("Too many catalog predicates for a 32-bit mask.");
            }

            _catalog = catalog;
            _names = predicates.Keys.ToArray();
            var checks = predicates.Values.ToArray();
            _masks = new int[catalog.Count];
            _all = (1 << _names.Length) - 1;
            for (var i = 0; i < catalog.Count; i++)
            {
                var mask = 0;
                for (var p = 0; p < checks.Length; p++)
                {
                    if (checks[p](catalog[i]))
                    {
                        mask |= 1 << p;
                    }
                }
                _masks[i] = mask;
            }
        }

        /// <summary>Позиции, прошедшие все условия.</summary>
        public List<CatalogItem> Matching() => Where(_all).ToList();

        /// <summary>Позиции, прошедшие все условия, кроме названного: так считается счётчик варианта этого фасета.</summary>
        public IEnumerable<CatalogItem> Except(string facet) => Where(Required(facet));

        public int CountExcept(string facet, Func<CatalogItem, bool> candidate)
        {
            var required = Required(facet);
            var count = 0;
            for (var i = 0; i < _masks.Length; i++)
            {
                if ((_masks[i] & required) == required && candidate(_catalog[i]))
                {
                    count++;
                }
            }
            return count;
        }

        private int Required(string facet)
        {
            var index = Array.IndexOf(_names, facet);
            return index < 0 ? _all : _all & ~(1 << index);
        }

        private IEnumerable<CatalogItem> Where(int required)
        {
            for (var i = 0; i < _masks.Length; i++)
            {
                if ((_masks[i] & required) == required)
                {
                    yield return _catalog[i];
                }
            }
        }
    }
}
