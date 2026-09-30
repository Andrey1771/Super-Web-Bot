using SuperBot.Core.Entities;

namespace SuperBot.WebApi.Services.Storefront;

/// <summary>
/// Карточка товара на языке покупателя: тексты, введённые админом, подменяются переводами из полей *I18n.
/// Английское остаётся, когда перевода нет. Применяется к объекту запроса перед отдачей витрине; админка
/// читает карточку своим маршрутом и получает всё как есть.
/// </summary>
public static class GameDetailsLocalizer
{
    public static void Apply(GameDetails details, string? locale)
    {
        var code = BuyerLanguage.Normalize(locale);
        if (code is null || code == "en")
        {
            return;
        }

        details.Tagline = Localized.Pick(details.TaglineI18n, code, details.Tagline);
        details.DescriptionMarkdown = Localized.Pick(details.DescriptionMarkdownI18n, code, details.DescriptionMarkdown);
        details.KeyFeatures = Localized.PickList(details.KeyFeaturesI18n, code, details.KeyFeatures);
        if (details.AgeRating is not null)
        {
            details.AgeRating.Label = Localized.Pick(details.AgeRating.LabelI18n, code, details.AgeRating.Label);
        }
        if (details.Activation is not null)
        {
            details.Activation.Label = Localized.Pick(details.Activation.LabelI18n, code, details.Activation.Label);
        }
        foreach (var item in details.Gallery)
        {
            item.Caption = Localized.Pick(item.CaptionI18n, code, item.Caption);
        }
        foreach (var edition in details.Editions)
        {
            edition.Title = Localized.Pick(edition.TitleI18n, code, edition.Title);
            edition.Description = Localized.Pick(edition.DescriptionI18n, code, edition.Description);
        }
        foreach (var award in details.Awards)
        {
            award.Title = Localized.Pick(award.TitleI18n, code, award.Title);
        }
        foreach (var block in new[] { details.SystemRequirements.Windows, details.SystemRequirements.Mac, details.SystemRequirements.Linux })
        {
            if (block is null)
            {
                continue;
            }
            block.Minimum.Notes = Localized.Pick(block.Minimum.NotesI18n, code, block.Minimum.Notes);
            if (block.Recommended is not null)
            {
                block.Recommended.Notes = Localized.Pick(block.Recommended.NotesI18n, code, block.Recommended.Notes);
            }
        }
    }

    /// <summary>Подписи жанров на языке покупателя — по позициям; сами значения остаются английскими (адреса, фильтры).</summary>
    public static List<string> GenreLabels(GameDetails details, string? locale) =>
        Localized.PickAligned(details.GenresI18n, BuyerLanguage.Normalize(locale), details.Genres);

    public static List<string> TagLabels(GameDetails details, string? locale) =>
        Localized.PickAligned(details.TagsI18n, BuyerLanguage.Normalize(locale), details.Tags);

    /// <summary>Переводы из админки к сохранению: чужие языки и пустые строки отбрасываются во всех вложенных полях.</summary>
    public static void NormalizeForSave(GameDetails details)
    {
        details.GenresI18n = Localized.NormalizeAligned(details.GenresI18n, details.Genres.Count);
        details.TagsI18n = Localized.NormalizeAligned(details.TagsI18n, details.Tags.Count);
        details.TaglineI18n = Localized.Normalize(details.TaglineI18n);
        details.DescriptionMarkdownI18n = Localized.Normalize(details.DescriptionMarkdownI18n);
        details.KeyFeaturesI18n = Localized.NormalizeList(details.KeyFeaturesI18n);
        if (details.AgeRating is not null)
        {
            details.AgeRating.LabelI18n = Localized.Normalize(details.AgeRating.LabelI18n);
        }
        if (details.Activation is not null)
        {
            details.Activation.LabelI18n = Localized.Normalize(details.Activation.LabelI18n);
        }
        NormalizeMedia(details.Gallery);
        NormalizeEditions(details.Editions);
        NormalizeAwards(details.Awards);
        NormalizeRequirements(details.SystemRequirements);
    }

    public static void NormalizeMedia(IEnumerable<GameMediaItem>? items)
    {
        foreach (var item in items ?? Array.Empty<GameMediaItem>())
        {
            item.CaptionI18n = Localized.Normalize(item.CaptionI18n);
        }
    }

    public static void NormalizeEditions(IEnumerable<GameEdition>? editions)
    {
        foreach (var edition in editions ?? Array.Empty<GameEdition>())
        {
            edition.TitleI18n = Localized.Normalize(edition.TitleI18n);
            edition.DescriptionI18n = Localized.Normalize(edition.DescriptionI18n);
        }
    }

    public static void NormalizeAwards(IEnumerable<GameAwardBadge>? awards)
    {
        foreach (var award in awards ?? Array.Empty<GameAwardBadge>())
        {
            award.TitleI18n = Localized.Normalize(award.TitleI18n);
        }
    }

    public static void NormalizeRequirements(GameSystemRequirements? requirements)
    {
        foreach (var block in new[] { requirements?.Windows, requirements?.Mac, requirements?.Linux })
        {
            if (block is null)
            {
                continue;
            }
            block.Minimum.NotesI18n = Localized.Normalize(block.Minimum.NotesI18n);
            if (block.Recommended is not null)
            {
                block.Recommended.NotesI18n = Localized.Normalize(block.Recommended.NotesI18n);
            }
        }
    }
}
