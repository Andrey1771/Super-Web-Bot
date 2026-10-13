using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Caching.Memory;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Services;
using SuperBot.WebApi.Controllers;
using SuperBot.WebApi.Services.Storefront;

namespace SuperBot.WebApi.Services.Seo;

/// <summary>
/// Теги &lt;head&gt; страницы, которые сервер вписывает в index.html до того, как заработает JavaScript (nginx SSI,
/// см. nginx/locations.conf и docker-entrypoint.d/30-taleshop-app-config.sh).
///
/// Витрина — одностраничное приложение: на любой адрес сервер отдавал одну и ту же оболочку с заголовком «Tale Shop»,
/// а заголовок, описание и картинку ставил уже браузер (PageMeta). Кто JavaScript не выполняет — превью ссылок
/// в Telegram, ВКонтакте, WhatsApp, Discord, частично Яндекс и Bing — видел у каждой игры «Tale Shop». Здесь — то же,
/// что ставит PageMeta, для страниц со своими данными: игра или программа и статья блога. Остальным страницам —
/// пустая строка, и в &lt;head&gt; остаются общие теги из index.html.
///
/// Всем отдаётся одно и то же — и людям, и роботам: это не подмена страницы для поисковиков. Теги помечены
/// data-page-meta, как и те, что ставит PageMeta: при переходе по сайту она их обновит и уберёт, а не задвоит.
/// </summary>
public sealed partial class PageHeadService(
    ICatalogSnapshotService catalog,
    IGameDetailsRepository gameDetails,
    IBlogRepository blog,
    IMemoryCache cache)
{
    public const string SiteName = "Tale Shop";
    private const string Owned = "data-page-meta=\"true\"";
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(5);

    private static readonly IReadOnlyDictionary<string, string> OgLocales = new Dictionary<string, string>
    {
        ["en"] = "en_US", ["ru"] = "ru_RU", ["uk"] = "uk_UA", ["pl"] = "pl_PL",
    };

    /// <summary>Описание игры без своего текста — та же фраза, что у витрины (product.metaDesc в словарях фронта).</summary>
    private static readonly IReadOnlyDictionary<string, string> FallbackGameDescription = new Dictionary<string, string>
    {
        ["en"] = "Buy {0} — instant key delivery and secure checkout at Tale Shop.",
        ["ru"] = "Купить {0} — мгновенная выдача ключа и безопасная оплата в Tale Shop.",
        ["uk"] = "Купити {0} — миттєва видача ключа та безпечна оплата в Tale Shop.",
        ["pl"] = "Kup {0} — natychmiastowa dostawa klucza i bezpieczna płatność w Tale Shop.",
    };

    [GeneratedRegex(@"^/games/(?!category/)([^/?#]+)/?$", RegexOptions.IgnoreCase)]
    private static partial Regex GamePath();

    [GeneratedRegex(@"^/news/([^/?#]+)/?$", RegexOptions.IgnoreCase)]
    private static partial Regex NewsPath();

    /// <param name="requestUri">Адрес страницы, как его запросил браузер: путь и параметры (`/games/elden-ring?lang=ru`).</param>
    /// <param name="baseUrl">Схема и домен сайта — для абсолютных адресов (канонический, картинка).</param>
    public async Task<string> BuildAsync(string? requestUri, string baseUrl)
    {
        if (string.IsNullOrWhiteSpace(requestUri) || !requestUri.StartsWith('/'))
        {
            return string.Empty;
        }

        var (path, lang) = Parse(requestUri);
        var key = $"seo:head:{baseUrl}:{lang}:{path}";
        if (cache.TryGetValue(key, out string? cached) && cached is not null)
        {
            return cached;
        }

        var html = await BuildUncachedAsync(path, lang, baseUrl.TrimEnd('/'));
        cache.Set(key, html, CacheTtl);
        return html;
    }

    /// <summary>Путь без параметров и язык страницы: ?lang= из адреса, иначе английский — как у канонических адресов витрины.</summary>
    public static (string Path, string Lang) Parse(string requestUri)
    {
        var queryStart = requestUri.IndexOf('?');
        var path = queryStart < 0 ? requestUri : requestUri[..queryStart];
        var lang = "en";
        if (queryStart >= 0)
        {
            foreach (var pair in requestUri[(queryStart + 1)..].Split('&', StringSplitOptions.RemoveEmptyEntries))
            {
                var parts = pair.Split('=', 2);
                if (parts.Length == 2 && parts[0] == "lang")
                {
                    var value = Uri.UnescapeDataString(parts[1]).ToLowerInvariant();
                    if (BuyerLanguage.Supported.Contains(value))
                    {
                        lang = value;
                    }
                }
            }
        }
        return (Uri.UnescapeDataString(path), lang);
    }

    private async Task<string> BuildUncachedAsync(string path, string lang, string baseUrl)
    {
        var game = GamePath().Match(path);
        if (game.Success)
        {
            return await BuildGameAsync(game.Groups[1].Value, lang, baseUrl);
        }

        var news = NewsPath().Match(path);
        if (news.Success)
        {
            return await BuildPostAsync(news.Groups[1].Value, lang, baseUrl);
        }

        return string.Empty;
    }

    private async Task<string> BuildGameAsync(string slug, string lang, string baseUrl)
    {
        // Тот же поиск, что у карты сайта: адрес — slugify от слага товара.
        var items = await catalog.GetAsync();
        var item = items.FirstOrDefault(candidate =>
            !string.IsNullOrWhiteSpace(candidate.Slug)
            && string.Equals(SeoController.Slugify(candidate.Slug), slug, StringComparison.OrdinalIgnoreCase));
        if (item is null)
        {
            return string.Empty;
        }

        var details = await gameDetails.GetByGameIdAsync(item.Id);
        if (details is not null)
        {
            if (details.IsDraft)
            {
                return string.Empty; // черновик снят с витрины — у страницы 404
            }
            GameDetailsLocalizer.Apply(details, lang);
        }

        var title = !string.IsNullOrWhiteSpace(details?.Title) ? details!.Title! : item.Title;
        var description =
            NonEmpty(details?.Tagline)
            ?? NonEmpty(PlainText(details?.DescriptionMarkdown, 160))
            ?? string.Format(FallbackGameDescription[lang], title);
        var image = Absolute(NonEmpty(details?.Cover?.Url) ?? NonEmpty(item.ImagePath), baseUrl);
        var canonicalPath = $"/games/{SeoController.Slugify(item.Slug)}";
        var canonical = $"{baseUrl}{SeoController.LanguageHref(canonicalPath, lang)}";

        var product = new Dictionary<string, object?>
        {
            ["@context"] = "https://schema.org",
            ["@type"] = "Product",
            ["name"] = title,
            ["description"] = NonEmpty(details?.Tagline) ?? title,
        };
        if (image is not null) product["image"] = image;
        if (!string.IsNullOrWhiteSpace(details?.Developer?.Name)) product["brand"] = new Dictionary<string, object?> { ["@type"] = "Brand", ["name"] = details!.Developer!.Name };
        product["offers"] = new Dictionary<string, object?>
        {
            ["@type"] = "Offer",
            ["price"] = item.FinalPrice,
            ["priceCurrency"] = item.Currency,
            ["availability"] = item.IsComingSoon
                ? "https://schema.org/PreOrder"
                : item.InStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            ["url"] = canonical,
        };

        return Render(title, description, image, "product", canonicalPath, lang, baseUrl, product);
    }

    private async Task<string> BuildPostAsync(string slug, string lang, string baseUrl)
    {
        var post = await blog.GetBySlugAsync(slug);
        if (post is null || !string.Equals(post.Status, "published", StringComparison.OrdinalIgnoreCase))
        {
            return string.Empty;
        }

        var title = Localized.Pick(post.TitleI18n, lang, post.Title);
        var excerpt = NonEmpty(Localized.Pick(post.ExcerptI18n, lang, post.Excerpt));
        var image = Absolute(NonEmpty(post.CoverUrl), baseUrl);
        var canonicalPath = $"/news/{post.Slug}";

        var article = new Dictionary<string, object?>
        {
            ["@context"] = "https://schema.org",
            ["@type"] = "BlogPosting",
            ["headline"] = title,
            ["inLanguage"] = lang,
            ["mainEntityOfPage"] = $"{baseUrl}{SeoController.LanguageHref(canonicalPath, lang)}",
            ["publisher"] = new Dictionary<string, object?> { ["@type"] = "Organization", ["name"] = SiteName },
        };
        if (excerpt is not null) article["description"] = excerpt;
        if (post.PublishedAt is not null) article["datePublished"] = post.PublishedAt;
        if (post.UpdatedAt != default) article["dateModified"] = post.UpdatedAt;
        if (image is not null) article["image"] = image;
        if (!string.IsNullOrWhiteSpace(post.AuthorName)) article["author"] = new Dictionary<string, object?> { ["@type"] = "Organization", ["name"] = post.AuthorName };

        return Render(title, excerpt, image, "article", canonicalPath, lang, baseUrl, article);
    }

    /// <summary>Теги — те же и в том же виде, что ставит PageMeta (tale-gameshop/src/components/common/PageMeta.tsx).</summary>
    private static string Render(string title, string? description, string? image, string ogType,
        string canonicalPath, string lang, string baseUrl, object structuredData)
    {
        var fullTitle = title.Contains(SiteName, StringComparison.Ordinal) ? title : $"{title} — {SiteName}";
        var canonical = $"{baseUrl}{SeoController.LanguageHref(canonicalPath, lang)}";
        var sb = new StringBuilder();

        sb.Append("<title>").Append(Enc(fullTitle)).Append("</title>");
        Meta(sb, "property", "og:title", fullTitle);
        Meta(sb, "property", "og:type", ogType);
        Meta(sb, "property", "og:site_name", SiteName);
        Meta(sb, "name", "twitter:card", image is null ? "summary" : "summary_large_image");
        if (description is not null)
        {
            Meta(sb, "name", "description", description);
            Meta(sb, "property", "og:description", description);
        }
        if (image is not null)
        {
            Meta(sb, "property", "og:image", image);
        }

        foreach (var code in BuyerLanguage.Supported)
        {
            sb.Append($"<link rel=\"alternate\" hreflang=\"{code}\" href=\"{Enc(baseUrl + SeoController.LanguageHref(canonicalPath, code))}\" {Owned}>");
        }
        sb.Append($"<link rel=\"alternate\" hreflang=\"x-default\" href=\"{Enc(baseUrl + canonicalPath)}\" {Owned}>");
        Meta(sb, "property", "og:locale", OgLocales[lang]);
        foreach (var code in BuyerLanguage.Supported.Where(code => code != lang))
        {
            Meta(sb, "property", "og:locale:alternate", OgLocales[code]);
        }

        sb.Append($"<link rel=\"canonical\" href=\"{Enc(canonical)}\" {Owned}>");
        Meta(sb, "property", "og:url", canonical);

        // «</» внутри JSON закрыл бы тег script раньше времени — экранируем.
        var json = JsonSerializer.Serialize(structuredData).Replace("</", "<\\/");
        sb.Append($"<script type=\"application/ld+json\" {Owned}>").Append(json).Append("</script>");
        return sb.ToString();
    }

    private static void Meta(StringBuilder sb, string attribute, string key, string content) =>
        sb.Append($"<meta {attribute}=\"{key}\" content=\"{Enc(content)}\" {Owned}>");

    private static string Enc(string value) => WebUtility.HtmlEncode(value);

    private static string? NonEmpty(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? Absolute(string? url, string baseUrl) =>
        url is null ? null
        : url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) || url.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ? url
        : $"{baseUrl}{(url.StartsWith('/') ? url : "/" + url)}";

    /// <summary>Первые символы описания без markdown-разметки — как у витрины (GameDetailsPage, metaDescription).</summary>
    private static string? PlainText(string? markdown, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(markdown))
        {
            return null;
        }
        var text = MarkdownChars().Replace(markdown, " ");
        text = Whitespace().Replace(text, " ").Trim();
        return text.Length <= maxLength ? text : text[..maxLength];
    }

    [GeneratedRegex(@"[#*_>`\[\]()!-]")]
    private static partial Regex MarkdownChars();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();
}
