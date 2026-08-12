using System.Xml.Linq;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Controllers;
using SuperBot.WebApi.Services;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Файлы для поисковых роботов.
///
/// Здесь легко сделать хуже, чем не делать вовсе: карта со ссылками на несуществующие
/// страницы подрывает доверие ко всей карте, а robots.txt, открывающий админку,
/// приглашает робота туда, где ему делать нечего. Поэтому проверяем не «эндпоинт отвечает»,
/// а содержимое.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class SeoTests
{
    private static readonly XNamespace SitemapNs = "http://www.sitemaps.org/schemas/sitemap/0.9";

    private readonly TaleShopApiFactory _factory;

    public SeoTests(TaleShopApiFactory factory) => _factory = factory;

    // ---------- helpers ----------

    private void RefreshCaches(string baseUrl)
    {
        using var scope = _factory.Services.CreateScope();
        var cache = scope.ServiceProvider.GetRequiredService<IMemoryCache>();
        cache.Remove(CatalogSnapshotService.CacheKey);
        cache.Remove($"{SeoController.SitemapCacheKey}:{baseUrl}");
    }

    private async Task<string> SeedGameAsync(string title, string slug)
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();

        await games.CreateAsync(new Game
        {
            Name = title,
            Title = title,
            Slug = slug,
            Price = 10m,
            ImagePath = "cover.png",
            Description = "seo probe",
            GameType = GameType.Action,
            ReleaseDate = DateTime.UtcNow.AddYears(-1)
        });

        var all = await games.GetAllAsync();
        return all.First(game => game.Slug == slug).Id!;
    }

    private async Task<List<string>> GetSitemapUrlsAsync()
    {
        var client = _factory.CreateClient();
        RefreshCaches(client.BaseAddress!.ToString().TrimEnd('/'));

        var response = await client.GetAsync("/sitemap.xml");
        response.EnsureSuccessStatusCode();

        var document = XDocument.Parse(await response.Content.ReadAsStringAsync());
        return document.Root!
            .Elements(SitemapNs + "url")
            .Select(url => url.Element(SitemapNs + "loc")!.Value)
            .ToList();
    }

    // ---------- robots.txt ----------

    [Fact]
    public async Task Robots_closes_private_areas_and_points_at_the_sitemap()
    {
        var response = await _factory.CreateClient().GetAsync("/robots.txt");
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadAsStringAsync();

        // Личный кабинет и админка индексироваться не должны: содержимого для выдачи там нет,
        // а обход тратит краулинговый бюджет.
        Assert.Contains("Disallow: /admin", body);
        Assert.Contains("Disallow: /account", body);
        Assert.Contains("Disallow: /checkout", body);
        // Адрес карты должен быть абсолютным — таков формат robots.txt.
        Assert.Contains("Sitemap: http", body);
        Assert.Contains("/sitemap.xml", body);
    }

    [Fact]
    public async Task Robots_leaves_the_storefront_open()
    {
        var body = await (await _factory.CreateClient().GetAsync("/robots.txt")).Content.ReadAsStringAsync();

        Assert.DoesNotContain("Disallow: /games", body);
        Assert.DoesNotContain("Disallow: /\n", body.Replace("\r", string.Empty));
    }

    // ---------- sitemap.xml ----------

    [Fact]
    public async Task Sitemap_lists_the_storefront_pages()
    {
        var urls = await GetSitemapUrlsAsync();

        Assert.Contains(urls, url => url.EndsWith("/"));
        Assert.Contains(urls, url => url.EndsWith("/games"));
        Assert.Contains(urls, url => url.EndsWith("/deals"));
        Assert.Contains(urls, url => url.EndsWith("/news"));
    }

    [Fact]
    public async Task Sitemap_lists_every_game_by_its_storefront_address()
    {
        var slug = $"seo-probe-{Guid.NewGuid():N}";
        await SeedGameAsync($"SEO Probe {Guid.NewGuid():N}", slug);

        var urls = await GetSitemapUrlsAsync();

        Assert.Contains(urls, url => url.EndsWith($"/games/{slug}"));
    }

    [Fact]
    public async Task Sitemap_lists_a_landing_page_per_category()
    {
        await SeedGameAsync($"SEO Action {Guid.NewGuid():N}", $"seo-action-{Guid.NewGuid():N}");

        var urls = await GetSitemapUrlsAsync();

        Assert.Contains(urls, url => url.EndsWith("/games/category/action"));
    }

    [Fact]
    public async Task Sitemap_never_points_at_private_areas()
    {
        var urls = await GetSitemapUrlsAsync();

        // Сравниваем ИМЕННО начало пути, а не подстроку: товар со слагом «admin-probe»
        // живёт по адресу /games/admin-probe и закрытым разделом не является.
        var paths = urls.Select(url => new Uri(url).AbsolutePath).ToList();

        foreach (var area in new[] { "/admin", "/account", "/checkout", "/cart" })
        {
            Assert.DoesNotContain(paths, path =>
                path.Equals(area, StringComparison.OrdinalIgnoreCase) ||
                path.StartsWith($"{area}/", StringComparison.OrdinalIgnoreCase));
        }
    }

    // ---------- адреса ----------

    [Theory]
    // Знаки препинания ВЫБРАСЫВАЮТСЯ, а не заменяются дефисом: витрина строит адрес так же,
    // и любое расхождение превратило бы карту в набор ссылок на несуществующие страницы.
    [InlineData("Baldur's Gate III", "baldurs-gate-iii")]
    [InlineData("  Elden   Ring  ", "elden-ring")]
    [InlineData("Half-Life 2", "half-life-2")]
    [InlineData("S.T.A.L.K.E.R.", "stalker")]
    [InlineData("Role-Playing Games (RPGs)", "role-playing-games-rpgs")]
    public void Address_matches_the_one_the_storefront_builds(string title, string expected)
    {
        Assert.Equal(expected, SeoController.Slugify(title));
    }
}
