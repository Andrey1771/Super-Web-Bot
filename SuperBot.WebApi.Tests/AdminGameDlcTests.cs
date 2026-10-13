using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// DLC игры в редакторе карточки: список (с черновиками), создание черновиком с уникальным адресом, привязка
/// существующего товара и отвязка. Один уровень: игра → её DLC; программы DLC не имеют.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class AdminGameDlcTests
{
    private readonly TaleShopApiFactory _factory;

    public AdminGameDlcTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient Admin()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "admin@test.local");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        return client;
    }

    private static async Task<JsonElement> Body(HttpResponseMessage r) => JsonSerializer.Deserialize<JsonElement>(await r.Content.ReadAsStringAsync());

    private async Task<Game> SeedAsync(string prefix, string? parent = null, ProductKind kind = ProductKind.Game)
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var slug = $"{prefix}-{Guid.NewGuid():N}"[..22];
        var game = new Game
        {
            Id = ObjectId.GenerateNewId().ToString(), Name = slug, Title = slug, Slug = slug, Price = 30m, Currency = "USD",
            ImagePath = "c.png", ReleaseDate = DateTime.UtcNow.AddYears(-1), ParentGameId = parent, Kind = kind, Genre = "strategy", GameType = GameType.Strategy,
        };
        await games.CreateAsync(game);
        scope.ServiceProvider.GetRequiredService<SuperBot.WebApi.Services.ICatalogSnapshotService>().Invalidate();
        return game;
    }

    private async Task<Game> GameAsync(string id)
    {
        using var scope = _factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<IGameRepository>().GetByIdAsync(id);
    }

    [Fact]
    public async Task Creates_a_draft_dlc_that_inherits_the_genre_and_gets_a_free_address()
    {
        var game = await SeedAsync("base");
        var admin = Admin();
        var name = $"Season Pass {Guid.NewGuid():N}"[..20];

        var first = await Body(await admin.PostAsJsonAsync($"/api/admin/games/{game.Id}/dlc", new { name, price = 9.99m }));
        var second = await Body(await admin.PostAsJsonAsync($"/api/admin/games/{game.Id}/dlc", new { name, price = 9.99m }));

        // Одинаковые названия у дополнений разных игр — обычное дело; адрес у второго — свой.
        Assert.NotEqual(first.GetProperty("slug").GetString(), second.GetProperty("slug").GetString());
        var dlc = await GameAsync(first.GetProperty("id").GetString()!);
        Assert.Equal(game.Id, dlc.ParentGameId);
        Assert.Equal("strategy", dlc.Genre);
        Assert.Equal(9.99m, dlc.Price);

        var list = await Body(await admin.GetAsync($"/api/admin/games/{game.Id}/dlc"));
        var items = list.GetProperty("items").EnumerateArray().ToList();
        Assert.Equal(2, items.Count);
        Assert.All(items, item => Assert.True(item.GetProperty("isDraft").GetBoolean()));
    }

    [Fact]
    public async Task Attaches_and_detaches_an_existing_product()
    {
        var game = await SeedAsync("base");
        var addon = await SeedAsync("addon");
        var admin = Admin();

        Assert.Equal(HttpStatusCode.NoContent, (await admin.PutAsync($"/api/admin/games/{game.Id}/dlc/{addon.Id}", null)).StatusCode);
        Assert.Equal(game.Id, (await GameAsync(addon.Id!)).ParentGameId);

        // Со стороны DLC видна его игра.
        var fromAddon = await Body(await admin.GetAsync($"/api/admin/games/{addon.Id}/dlc"));
        Assert.Equal(game.Id, fromAddon.GetProperty("parent").GetProperty("id").GetString());

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/admin/games/{game.Id}/dlc/{addon.Id}")).StatusCode);
        Assert.Null((await GameAsync(addon.Id!)).ParentGameId);
    }

    [Fact]
    public async Task Keeps_a_single_level_of_games_only()
    {
        var game = await SeedAsync("base");
        var dlc = await SeedAsync("dlc", parent: game.Id);
        var other = await SeedAsync("other");
        var software = await SeedAsync("soft", kind: ProductKind.Software);
        var admin = Admin();

        // DLC к DLC.
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsync($"/api/admin/games/{dlc.Id}/dlc/{other.Id}", null)).StatusCode);
        // Игра со своими DLC не становится чьим-то DLC.
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsync($"/api/admin/games/{other.Id}/dlc/{game.Id}", null)).StatusCode);
        // Программы DLC не имеют и сами им не бывают.
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsync($"/api/admin/games/{software.Id}/dlc/{other.Id}", null)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsync($"/api/admin/games/{game.Id}/dlc/{software.Id}", null)).StatusCode);
        // Те же правила — у обычного сохранения игры.
        var viaForm = await admin.PutAsJsonAsync($"/api/game/{other.Id}", new { parentGameId = dlc.Id });
        Assert.Equal(HttpStatusCode.BadRequest, viaForm.StatusCode);
        Assert.Null((await GameAsync(other.Id!)).ParentGameId);
    }

    [Fact]
    public async Task Quick_edit_changes_the_product_and_its_card_together()
    {
        var game = await SeedAsync("base");
        var admin = Admin();
        var created = await Body(await admin.PostAsJsonAsync($"/api/admin/games/{game.Id}/dlc", new { name = "Old name", price = 5m }));
        var dlcId = created.GetProperty("id").GetString()!;

        var patch = new HttpRequestMessage(HttpMethod.Patch, $"/api/admin/games/{game.Id}/dlc/{dlcId}")
        {
            Content = JsonContent.Create(new { title = "Expansion Pass", price = 19.99m, releaseDate = "2026-11-20", isDraft = false }),
        };
        Assert.Equal(HttpStatusCode.NoContent, (await admin.SendAsync(patch)).StatusCode);

        var dlc = await GameAsync(dlcId);
        Assert.Equal("Expansion Pass", dlc.Title);
        Assert.Equal(19.99m, dlc.Price);
        Assert.Equal(new DateTime(2026, 11, 20), dlc.ReleaseDate.Date);
        using (var scope = _factory.Services.CreateScope())
        {
            var details = await scope.ServiceProvider.GetRequiredService<IGameDetailsRepository>().GetByGameIdAsync(dlcId);
            Assert.Equal("Expansion Pass", details.Title);
            Assert.False(details.IsDraft);
        }

        // Через чужую игру DLC не правится.
        var other = await SeedAsync("other");
        var foreign = new HttpRequestMessage(HttpMethod.Patch, $"/api/admin/games/{other.Id}/dlc/{dlcId}") { Content = JsonContent.Create(new { price = 1m }) };
        Assert.Equal(HttpStatusCode.NotFound, (await admin.SendAsync(foreign)).StatusCode);
    }

    [Fact]
    public async Task Deleting_a_dlc_removes_its_page_too()
    {
        var game = await SeedAsync("base");
        var admin = Admin();
        var created = await Body(await admin.PostAsJsonAsync($"/api/admin/games/{game.Id}/dlc", new { name = $"Gone {Guid.NewGuid():N}"[..14], price = 5m }));
        var dlcId = created.GetProperty("id").GetString()!;
        var slug = created.GetProperty("slug").GetString()!;
        // Опубликованное DLC: его страница открыта.
        var publish = new HttpRequestMessage(HttpMethod.Patch, $"/api/admin/games/{game.Id}/dlc/{dlcId}") { Content = JsonContent.Create(new { isDraft = false }) };
        await admin.SendAsync(publish);
        Assert.Equal(HttpStatusCode.OK, (await _factory.CreateClient().GetAsync($"/api/games/{slug}")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/game/{dlcId}")).StatusCode);

        Assert.Equal(HttpStatusCode.NotFound, (await _factory.CreateClient().GetAsync($"/api/games/{slug}")).StatusCode);
        var list = await Body(await admin.GetAsync($"/api/admin/games/{game.Id}/dlc"));
        Assert.Empty(list.GetProperty("items").EnumerateArray());
    }

    [Fact]
    public async Task Only_admins_manage_dlc()
    {
        var game = await SeedAsync("base");
        var anonymous = await _factory.CreateClient().PostAsJsonAsync($"/api/admin/games/{game.Id}/dlc", new { name = "X", price = 1m });
        Assert.Contains(anonymous.StatusCode, new[] { HttpStatusCode.Unauthorized, HttpStatusCode.Forbidden });
    }
}
