using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Services;
using SuperBot.WebApi.Services.Seo;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Теги &lt;head&gt;, которые сервер вписывает в index.html (nginx SSI): у игры свои заголовок, описание на языке страницы,
/// картинка, канонический адрес и разметка — ещё до JavaScript. Превью ссылок в мессенджерах JavaScript не выполняют,
/// и раньше у каждой игры видели «Tale Shop».
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class PageHeadTests
{
    private readonly TaleShopApiFactory _factory;

    public PageHeadTests(TaleShopApiFactory factory) => _factory = factory;

    private async Task<string> SeedGameAsync(string title, string slug, bool draft = false)
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        await games.CreateAsync(new Game
        {
            Name = title, Title = title, Slug = slug, Price = 25m, Currency = "USD", ImagePath = "/uploads/cover.png",
            Description = "probe", GameType = GameType.Action, ReleaseDate = DateTime.UtcNow.AddYears(-1),
        });
        var id = (await games.GetAllAsync()).First(game => game.Slug == slug).Id!;
        await scope.ServiceProvider.GetRequiredService<IGameDetailsRepository>().CreateAsync(new GameDetails
        {
            GameId = id, Slug = slug, Title = title, IsDraft = draft,
            Tagline = "Rise, Tarnished.",
            TaglineI18n = new Dictionary<string, string> { ["ru"] = "Восстань, погасший." },
            Cover = new GameCover { Url = "/uploads/elden-cover.webp", Alt = title },
        });
        scope.ServiceProvider.GetRequiredService<IMemoryCache>().Remove(CatalogSnapshotService.CacheKey);
        return id;
    }

    private async Task<string> HeadAsync(string pageUri)
    {
        var client = _factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/seo/page-head");
        request.Headers.Add("X-Page-Uri", pageUri);
        var response = await client.SendAsync(request);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsStringAsync();
    }

    [Fact]
    public async Task Game_page_gets_its_own_title_description_image_and_markup_in_the_page_language()
    {
        var slug = $"head-{Guid.NewGuid():N}"[..20];
        await SeedGameAsync("Head Probe Ring", slug);

        var head = await HeadAsync($"/games/{slug}?lang=ru");

        Assert.Contains("<title>Head Probe Ring — Tale Shop</title>", head);
        // Описание — на языке страницы.
        Assert.Contains("content=\"Восстань, погасший.\"", head);
        Assert.Contains($"/uploads/elden-cover.webp\"", head);
        Assert.Contains("property=\"og:image\" content=\"http", head); // абсолютный адрес — превью берут только такие
        Assert.Contains($"rel=\"canonical\" href=\"http://localhost/games/{slug}?lang=ru\"", head);
        Assert.Contains("hreflang=\"x-default\"", head);
        Assert.Contains("\"@type\":\"Product\"", head);
        Assert.Contains("\"priceCurrency\":\"USD\"", head);
        // Помечены, как теги PageMeta: витрина их обновит и уберёт, а не задвоит.
        var tags = System.Text.RegularExpressions.Regex.Matches(head, "<(meta|link|script) [^>]*>").Select(match => match.Value).ToList();
        Assert.NotEmpty(tags);
        Assert.All(tags, tag => Assert.Contains("data-page-meta=\"true\"", tag));
    }

    [Fact]
    public async Task English_is_the_default_and_the_canonical_address_has_no_language_parameter()
    {
        var slug = $"head-{Guid.NewGuid():N}"[..20];
        await SeedGameAsync("Head Probe English", slug);

        var head = await HeadAsync($"/games/{slug}");

        Assert.Contains("content=\"Rise, Tarnished.\"", head);
        Assert.Contains($"rel=\"canonical\" href=\"http://localhost/games/{slug}\"", head);
        Assert.Contains("property=\"og:locale\" content=\"en_US\"", head);
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/cart")]
    [InlineData("/games")]
    [InlineData("/games/category/action")]
    [InlineData("/games/no-such-game-anywhere")]
    [InlineData("/news/no-such-post")]
    public async Task Pages_without_their_own_data_get_nothing_and_keep_the_common_tags(string pageUri)
    {
        Assert.Equal(string.Empty, await HeadAsync(pageUri));
    }

    [Fact]
    public async Task A_draft_is_not_described_its_page_is_a_404()
    {
        var slug = $"head-{Guid.NewGuid():N}"[..20];
        await SeedGameAsync("Head Probe Draft", slug, draft: true);

        Assert.Equal(string.Empty, await HeadAsync($"/games/{slug}"));
    }

    [Theory]
    [InlineData("/games/elden-ring?lang=ru", "/games/elden-ring", "ru")]
    [InlineData("/games/elden-ring?utm_source=x&lang=pl", "/games/elden-ring", "pl")]
    [InlineData("/games/elden-ring?lang=de", "/games/elden-ring", "en")]
    [InlineData("/news/autumn-sale", "/news/autumn-sale", "en")]
    public void Reads_the_path_and_the_page_language(string uri, string path, string lang) =>
        Assert.Equal((path, lang), PageHeadService.Parse(uri));
}
