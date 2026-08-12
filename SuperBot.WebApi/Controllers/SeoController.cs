using System.Text;
using System.Xml.Linq;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Services;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Файлы для поисковых роботов: карта сайта и правила обхода.
///
/// Отдаёт их приложение, а не статика, по двум причинам: карта должна содержать актуальные
/// товары и статьи, а в robots.txt нужен абсолютный адрес карты — а он известен только
/// из самого запроса (домен на разных стендах разный).
///
/// Обе локации проброшены в nginx.conf — без этого nginx отдаст их из статики фронта.
/// </summary>
[ApiController]
public class SeoController : ControllerBase
{
    public const string SitemapCacheKey = "seo:sitemap";

    /// <summary>Карта пересобирается редко: товары и статьи меняются не поминутно.</summary>
    private static readonly TimeSpan SitemapCacheTtl = TimeSpan.FromHours(1);

    /// <summary>
    /// Разделы, куда роботу ходить незачем: личные, служебные и те, что требуют входа.
    /// Индексировать их нечего, а обход тратит краулинговый бюджет на страницы-заглушки.
    /// </summary>
    private static readonly string[] DisallowedPaths =
    [
        "/admin",
        "/account",
        "/cart",
        "/checkout",
        "/logIn",
        "/signUp",
        "/callback",
        "/tg",
        "/newsletter/confirm",
        "/newsletter/unsubscribe"
    ];

    private readonly ICatalogSnapshotService _catalogSnapshot;
    private readonly IBlogRepository _blogRepository;
    private readonly IMemoryCache _memoryCache;

    public SeoController(
        ICatalogSnapshotService catalogSnapshot,
        IBlogRepository blogRepository,
        IMemoryCache memoryCache)
    {
        _catalogSnapshot = catalogSnapshot;
        _blogRepository = blogRepository;
        _memoryCache = memoryCache;
    }

    [HttpGet("/robots.txt")]
    public ContentResult Robots()
    {
        var builder = new StringBuilder();
        builder.AppendLine("User-agent: *");
        foreach (var path in DisallowedPaths)
        {
            builder.AppendLine($"Disallow: {path}");
        }

        builder.AppendLine();
        builder.AppendLine($"Sitemap: {BaseUrl()}/sitemap.xml");

        return Content(builder.ToString(), "text/plain; charset=utf-8");
    }

    [HttpGet("/sitemap.xml")]
    public async Task<ContentResult> Sitemap()
    {
        var baseUrl = BaseUrl();

        // Ключ включает адрес: за одним приложением может стоять несколько доменов,
        // и ссылки в карте у них разные.
        var xml = await _memoryCache.GetOrCreateAsync($"{SitemapCacheKey}:{baseUrl}", async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = SitemapCacheTtl;
            return await BuildSitemapAsync(baseUrl);
        });

        return Content(xml ?? string.Empty, "application/xml; charset=utf-8");
    }

    /// <summary>
    /// Адрес сайта берём из запроса, с оглядкой на заголовки прокси: приложение стоит
    /// за nginx и о собственном домене и схеме само не знает.
    /// </summary>
    private string BaseUrl()
    {
        var scheme = Request.Headers["X-Forwarded-Proto"].FirstOrDefault() ?? Request.Scheme;
        var host = Request.Headers["X-Forwarded-Host"].FirstOrDefault() ?? Request.Host.Value;
        return $"{scheme}://{host}".TrimEnd('/');
    }

    private async Task<string> BuildSitemapAsync(string baseUrl)
    {
        XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
        var urls = new List<XElement>();

        void Add(string path, DateTime? lastModified, string changeFrequency, string priority)
        {
            var url = new XElement(ns + "url", new XElement(ns + "loc", $"{baseUrl}{path}"));

            // lastmod указываем только когда он действительно известен: неверная дата
            // хуже отсутствующей — робот перестаёт доверять всей карте.
            if (lastModified.HasValue)
            {
                url.Add(new XElement(ns + "lastmod", lastModified.Value.ToString("yyyy-MM-dd")));
            }

            url.Add(new XElement(ns + "changefreq", changeFrequency));
            url.Add(new XElement(ns + "priority", priority));
            urls.Add(url);
        }

        Add("/", null, "daily", "1.0");
        Add("/games", null, "daily", "0.9");
        Add("/deals", null, "daily", "0.8");
        Add("/news", null, "weekly", "0.6");
        Add("/about", null, "monthly", "0.3");
        Add("/faq", null, "monthly", "0.3");

        var catalog = await _catalogSnapshot.GetAsync();

        // Страницы категорий: отдельный адрес на жанр, который можно показать в выдаче.
        foreach (var category in catalog
                     .Select(item => item.Category)
                     .Where(category => !string.IsNullOrWhiteSpace(category))
                     .Distinct(StringComparer.OrdinalIgnoreCase)
                     .OrderBy(category => category, StringComparer.OrdinalIgnoreCase))
        {
            Add($"/games/category/{Slugify(category)}", null, "weekly", "0.7");
        }

        foreach (var item in catalog.Where(item => !string.IsNullOrWhiteSpace(item.Slug)))
        {
            Add($"/games/{Slugify(item.Slug)}", null, "weekly", "0.8");
        }

        try
        {
            var posts = await _blogRepository.GetPublishedAsync(int.MaxValue);
            foreach (var post in posts.Where(post => !string.IsNullOrWhiteSpace(post.Slug)))
            {
                Add($"/news/{post.Slug}", post.UpdatedAt == default ? post.PublishedAt : post.UpdatedAt, "monthly", "0.5");
            }
        }
        catch
        {
            // Блог недоступен — карта товаров всё равно должна уйти роботу.
        }

        var document = new XDocument(
            new XDeclaration("1.0", "utf-8", null),
            new XElement(ns + "urlset", urls));

        return document.Declaration + Environment.NewLine + document;
    }

    /// <summary>
    /// Повторяет slugify витрины (tale-gameshop/src/utils/slugify.ts) СИМВОЛ В СИМВОЛ —
    /// иначе ссылки из карты вели бы на страницы, которых нет.
    ///
    /// Правило: знаки препинания ВЫБРАСЫВАЮТСЯ, а не заменяются дефисом
    /// («Baldur's Gate» → «baldurs-gate», а не «baldur-s-gate»), пробелы становятся дефисом,
    /// подряд идущие дефисы схлопываются. Буквы любых алфавитов сохраняются.
    /// </summary>
    public static string Slugify(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var kept = new StringBuilder(value.Length);
        foreach (var symbol in value.Trim().ToLowerInvariant())
        {
            if (char.IsLetterOrDigit(symbol) || char.IsWhiteSpace(symbol) || symbol == '-')
            {
                kept.Append(symbol);
            }
        }

        var slug = new StringBuilder(kept.Length);
        foreach (var symbol in kept.ToString())
        {
            var next = char.IsWhiteSpace(symbol) ? '-' : symbol;
            if (next == '-' && slug.Length > 0 && slug[^1] == '-')
            {
                continue;
            }

            slug.Append(next);
        }

        return slug.ToString();
    }
}
