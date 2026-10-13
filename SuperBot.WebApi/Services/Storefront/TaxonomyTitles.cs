using SuperBot.Core.Entities;

namespace SuperBot.WebApi.Services.Storefront;

/// <summary>
/// Названия жанров и категорий ПО на языке покупателя для ответов витрины.
///
/// Снимок каталога общий для всех языков, и в нём лежит английское название (Category) — по нему работают
/// фильтры, адреса и фасеты. Подпись на языке покупателя подставляется на выходе, по коду жанра/категории
/// и словарю Titles из настроек. Перевода в настройках нет — остаётся английское название.
/// </summary>
public sealed class TaxonomyTitles
{
    private readonly Dictionary<string, string> _genreByTag;
    private readonly Dictionary<string, string> _genreByEnglish;
    private readonly Dictionary<string, string> _softwareByTag;

    private TaxonomyTitles(IReadOnlyList<GameCategory> genres, IReadOnlyList<GameCategory> software, string? locale)
    {
        Locale = locale;
        _genreByTag = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        _genreByEnglish = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var genre in genres.Where(genre => !string.IsNullOrWhiteSpace(genre?.Tag)))
        {
            var title = genre.TitleFor(locale);
            _genreByTag[genre.Tag] = title;
            if (!string.IsNullOrWhiteSpace(genre.Title))
            {
                _genreByEnglish[genre.Title] = title;
            }
        }
        _softwareByTag = software
            .Where(category => !string.IsNullOrWhiteSpace(category?.Tag))
            .GroupBy(category => category.Tag, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First().TitleFor(locale), StringComparer.OrdinalIgnoreCase);
    }

    public string? Locale { get; }

    public static async Task<TaxonomyTitles> LoadAsync(IGameGenreDirectory genres, ISoftwareCategoryDirectory software, string? locale) =>
        new(await genres.GetAsync(), await software.GetAsync(), BuyerLanguage.Normalize(locale));

    /// <summary>Подпись раздела карточки: категория ПО или жанр игры — на языке покупателя.</summary>
    public string CategoryOf(CatalogItem item)
    {
        if (item.Kind == ProductKind.Software)
        {
            return item.SoftwareCategory is { } tag && _softwareByTag.TryGetValue(tag, out var software) ? software : item.Category;
        }
        return item.Genre is { } genre && _genreByTag.TryGetValue(genre, out var title) ? title : item.Category;
    }

    /// <summary>
    /// Жанры карточки. Свои жанры товара (свободный текст из карточки) не переводятся; запасной список из одного
    /// названия жанра — переводится, иначе на русской витрине под игрой торчал бы английский жанр.
    /// </summary>
    public IReadOnlyList<string> GenresOf(CatalogItem item)
    {
        // Сначала переводы из карточки; без них единственный жанр, совпадающий с категорией, — это запасной список из справочника.
        var picked = Localized.PickAligned(item.GenresI18n, Locale, item.Genres);
        return item.Genres.Length == 1 && picked[0] == item.Genres[0] && string.Equals(item.Genres[0], item.Category, StringComparison.Ordinal)
            ? new[] { CategoryOf(item) }
            : picked;
    }

    /// <summary>Описание карточки на языке покупателя; нет перевода — английское.</summary>
    public string DescriptionOf(CatalogItem item) => Localized.Pick(item.DescriptionI18n, Locale, item.Description) ?? item.Description;

    /// <summary>Подпись жанра по английскому названию — для фасета фильтра, где значением остаётся английское.</summary>
    public string GenreLabel(string englishTitle) =>
        _genreByEnglish.TryGetValue(englishTitle, out var title) ? title : englishTitle;

    /// <summary>
    /// Переводы из админки к сохранению: только языки сайта кроме английского, без пустых строк.
    /// Ошибка — текст для админа, если перевод длиннее допустимого.
    /// </summary>
    public static Dictionary<string, string>? NormalizeTitles(IReadOnlyDictionary<string, string>? titles, int maxLength, out string? error)
    {
        error = null;
        if (titles is null)
        {
            return null;
        }
        var result = new Dictionary<string, string>();
        foreach (var (locale, value) in titles)
        {
            var code = BuyerLanguage.Normalize(locale);
            var text = (value ?? string.Empty).Trim();
            if (code is null || code == BuyerLanguage.Supported[0] || text.Length == 0)
            {
                continue;
            }
            if (text.Length > maxLength)
            {
                error = $"Name in “{code}” must be up to {maxLength} characters.";
                return null;
            }
            result[code] = text;
        }
        return result.Count > 0 ? result : null;
    }
}
