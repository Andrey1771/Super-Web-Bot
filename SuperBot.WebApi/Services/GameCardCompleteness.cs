using SuperBot.Core.Entities;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Проверка полноты карточки товара для админки. Проверки зависят от вида: у ПО нет жанров, трейлера и возрастного
/// рейтинга, зато есть категория раздела, место активации и лицензия у каждого варианта. Правило витрины «нет данных — нет блока» означает,
/// что у неполной карточки страница просто короче, и никто этого не замечает — поэтому админ должен
/// видеть список пробелов при сохранении и в списке игр. Каждая проверка — код + текст + важность.
/// </summary>
public static class GameCardCompleteness
{
    public sealed record Issue(string Code, string Message, string Severity);

    /// <param name="availableByEdition">
    /// Остаток ключей по кодам изданий (базовое — под пустым кодом). Null — остаток не известен, и проверка ключей
    /// пропускается.
    /// </param>
    public static IReadOnlyList<Issue> Check(Game game, GameDetails? details, IReadOnlyDictionary<string, int>? availableByEdition = null)
    {
        var issues = new List<Issue>();
        void Add(string code, string message, string severity = "warning") => issues.Add(new Issue(code, message, severity));
        var software = game.Kind == ProductKind.Software;
        var noun = software ? "software" : "game";

        if (software && string.IsNullOrWhiteSpace(game.SoftwareCategory))
        {
            Add("softwareCategory", "No software category — the product is missing from every software category.", "error");
        }

        if (string.IsNullOrWhiteSpace(game.ImagePath) && string.IsNullOrWhiteSpace(game.CoverMediaId) && string.IsNullOrWhiteSpace(details?.Cover?.Url))
        {
            Add("cover", "No cover image — the card shows a placeholder.", "error");
        }
        if (details is null)
        {
            Add("details", $"No {noun} details yet — the page has only the catalog basics (title, price).", "error");
            return issues;
        }
        if (string.IsNullOrWhiteSpace(details.DescriptionMarkdown))
        {
            Add("description", $"No description — the “About this {noun}” block is hidden.", "error");
        }
        if (string.IsNullOrWhiteSpace(details.Tagline))
        {
            Add("tagline", "No tagline — the page title stands alone and search snippets fall back to a generic line.");
        }
        var gallery = details.Gallery ?? new List<GameMediaItem>();
        if (gallery.Count == 0)
        {
            Add("gallery", "No screenshots or trailer — the gallery shows only the cover.");
        }
        else if (!software && !gallery.Any(item => item.IsTrailer || string.Equals(item.Type, "video", StringComparison.OrdinalIgnoreCase)))
        {
            Add("trailer", "No trailer — video sells better than stills.", "info");
        }
        if (!software && (details.Genres?.Count ?? 0) == 0)
        {
            Add("genres", "No genres — the game is missing from genre pages and breadcrumbs.");
        }
        if ((details.Languages?.Text?.Count ?? 0) == 0)
        {
            Add("languages", "No languages — buyers can't see whether their language is supported.");
        }
        if (!software && (details.AgeRating is null || string.IsNullOrWhiteSpace(details.AgeRating.Label)))
        {
            Add("ageRating", "No age rating.", "info");
        }
        var platforms = details.Platforms;
        if (platforms is null || !(platforms.Windows || platforms.Mac || platforms.Linux || platforms.PlayStation || platforms.Xbox || platforms.Android || platforms.Ios))
        {
            Add("platforms", software ? "No operating systems — the page can't say where the software runs." : "No platforms — the page can't say where the key works.");
        }
        if (software && details.Activation is null)
        {
            Add("activation", "No activation info — buyers don't know where to redeem the key.");
        }
        if (!HasAnySpec(details.SystemRequirements?.Windows?.Minimum) && !HasAnySpec(details.SystemRequirements?.Mac?.Minimum) && !HasAnySpec(details.SystemRequirements?.Linux?.Minimum))
        {
            Add("systemRequirements", "No system requirements — the tab is hidden.", "info");
        }
        if (details.Developer is null || string.IsNullOrWhiteSpace(details.Developer.Name))
        {
            Add("developer", software ? "No vendor." : "No developer.", "info");
        }
        var editions = details.Editions ?? new List<GameEdition>();
        if (software)
        {
            // Лицензия — то, что покупатель выбирает: вариант без срока и числа устройств на странице не отличить от соседнего.
            foreach (var edition in editions.Where(e => SoftwareCatalog.LicenseLabel(e) is null))
            {
                Add("editionLicense", $"License “{edition.Title ?? edition.Code}” has no term or device count — buyers can't tell it apart.");
            }

            // Лицензия без ключей на витрине есть, а купить её нельзя. Не ошибка: карточку собирают до поставки ключей.
            // Склад считается так же, как в каталоге: ключи без кода — запас лицензии по умолчанию.
            if (availableByEdition is not null)
            {
                foreach (var edition in GameEditions.Sellable(editions))
                {
                    if (GameEditions.AvailableFor(availableByEdition, edition, GameEditions.IsDefaultIn(editions, edition)) == 0)
                    {
                        Add("editionKeys", $"License “{edition.Title ?? edition.Code}” has no keys in stock — buyers can't buy it.");
                    }
                }
            }
        }
        if (editions.Count > 1)
        {
            if (!editions.Any(e => e.IsDefault))
            {
                Add("editionDefault", "Several editions but none is marked as default — the first one is used.");
            }
            foreach (var edition in editions.Where(e => e.Price <= 0 && (e.Prices is null || e.Prices.Count == 0)))
            {
                Add("editionPrice", $"Edition “{edition.Title ?? edition.Code}” has no price — it shows as “not in currency” everywhere.", "error");
            }
            var dupes = editions.GroupBy(e => e.Code ?? string.Empty, StringComparer.OrdinalIgnoreCase).Where(g => g.Count() > 1).Select(g => g.Key).ToList();
            if (dupes.Count > 0)
            {
                Add("editionCodes", $"Duplicate edition codes: {string.Join(", ", dupes)}.", "error");
            }
        }
        return issues;
    }

    private static bool HasAnySpec(GameSystemRequirementSpec? spec) =>
        spec is not null && new[] { spec.Os, spec.Cpu, spec.Ram, spec.Gpu, spec.Storage, spec.Notes }.Any(value => !string.IsNullOrWhiteSpace(value));
}
