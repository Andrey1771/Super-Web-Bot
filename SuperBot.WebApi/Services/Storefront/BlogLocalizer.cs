using SuperBot.Core.Entities;

namespace SuperBot.WebApi.Services.Storefront;

/// <summary>
/// Пост блога на языке покупателя: заголовок, анонс и тело версии подменяются переводами из полей *I18n,
/// теги остаются английскими значениями фильтра, а подписи к ним идут отдельным списком по позициям.
/// Английское остаётся, когда перевода нет. Админка читает пост своим маршрутом и получает всё как есть.
/// </summary>
public static class BlogLocalizer
{
    public static string Title(BlogPost post, string? locale) =>
        Localized.Pick(post.TitleI18n, BuyerLanguage.Normalize(locale), post.Title) ?? post.Title;

    public static string Excerpt(BlogPost post, string? locale) =>
        Localized.Pick(post.ExcerptI18n, BuyerLanguage.Normalize(locale), post.Excerpt) ?? post.Excerpt;

    public static List<string> TagLabels(BlogPost post, string? locale) =>
        Localized.PickAligned(post.TagsI18n, BuyerLanguage.Normalize(locale), post.Tags ?? Array.Empty<string>());

    /// <summary>
    /// Копия версии для витрины: тексты на языке покупателя, словари переводов не отдаются. Тело берётся
    /// целиком на одном языке — переведённый markdown или html; если переведено только одно из них,
    /// второе пустое, чтобы страница не смешала два языка (без html она рендерит markdown сама).
    /// </summary>
    public static BlogPostVersion? Localize(BlogPostVersion? version, string? locale)
    {
        if (version is null)
        {
            return null;
        }
        var code = BuyerLanguage.Normalize(locale);
        var markdown = Localized.Pick(version.ContentMarkdownI18n, code, null);
        var html = Localized.Pick(version.ContentHtmlI18n, code, null);
        var translatedBody = markdown is not null || html is not null;
        return new BlogPostVersion
        {
            Id = version.Id,
            PostId = version.PostId,
            VersionNumber = version.VersionNumber,
            Title = Localized.Pick(version.TitleI18n, code, version.Title),
            Excerpt = Localized.Pick(version.ExcerptI18n, code, version.Excerpt),
            ContentMarkdown = translatedBody ? markdown ?? string.Empty : version.ContentMarkdown,
            ContentHtml = translatedBody ? html ?? string.Empty : version.ContentHtml,
            CoverAssetId = version.CoverAssetId,
            CreatedAt = version.CreatedAt,
            CreatedBy = version.CreatedBy,
            ChangeNote = version.ChangeNote
        };
    }

    /// <summary>Переводы из админки к сохранению: чужие языки и пустые строки отбрасываются.</summary>
    public static void NormalizeForSave(BlogPost post)
    {
        post.TitleI18n = Localized.Normalize(post.TitleI18n);
        post.ExcerptI18n = Localized.Normalize(post.ExcerptI18n);
        post.TagsI18n = Localized.NormalizeAligned(post.TagsI18n, post.Tags?.Length ?? 0);
    }

    public static void NormalizeForSave(BlogPostVersion version)
    {
        version.TitleI18n = Localized.Normalize(version.TitleI18n);
        version.ExcerptI18n = Localized.Normalize(version.ExcerptI18n);
        version.ContentMarkdownI18n = Localized.Normalize(version.ContentMarkdownI18n);
        version.ContentHtmlI18n = Localized.Normalize(version.ContentHtmlI18n);
    }
}
