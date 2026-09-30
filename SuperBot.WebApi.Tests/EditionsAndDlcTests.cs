using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Издания и DLC как товары. Ключи издания — отдельный пул: покупателю Deluxe не выдают ключ Standard,
/// базовое издание берёт ключи без кода. DLC — игра с ParentGameId: в общем каталоге её нет, на странице
/// базовой игры — есть, на своей странице — ссылка на базовую.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class EditionsAndDlcTests
{
    private readonly TaleShopApiFactory _factory;

    public EditionsAndDlcTests(TaleShopApiFactory factory) => _factory = factory;

    private static async Task<JsonElement> Body(HttpResponseMessage r) => JsonSerializer.Deserialize<JsonElement>(await r.Content.ReadAsStringAsync());

    private async Task<(string id, string slug)> SeedGameAsync(string? parentGameId = null, string prefix = "ed")
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var slug = $"{prefix}-{Guid.NewGuid():N}"[..20];
        var id = ObjectId.GenerateNewId().ToString();
        await games.CreateAsync(new Game { Id = id, Name = slug, Title = slug, Slug = slug, Price = 50m, Currency = "USD", ImagePath = "c.png", ReleaseDate = DateTime.UtcNow.AddYears(-1), ParentGameId = parentGameId });
        return (id, slug);
    }

    [Fact]
    public async Task Keys_are_dispensed_per_edition_and_base_edition_uses_untagged_keys()
    {
        var (gameId, _) = await SeedGameAsync();
        using var scope = _factory.Services.CreateScope();
        var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();

        await keys.AddPoolKeysAsync(gameId, "Steam", new[] { "BASE-0001-AAAA-BBBB" });
        await keys.AddPoolKeysAsync(gameId, "Steam", new[] { "DLX-0001-AAAA-BBBB", "DLX-0002-AAAA-BBBB" }, editionCode: "deluxe");

        Assert.Equal(1, await keys.CountAvailableByGameAsync(gameId, editionCode: string.Empty));
        Assert.Equal(2, await keys.CountAvailableByGameAsync(gameId, editionCode: "deluxe"));
        Assert.Equal(3, await keys.CountAvailableByGameAsync(gameId));
        var byEdition = await keys.CountAvailableByEditionAsync(gameId);
        Assert.Equal(1, byEdition[string.Empty]);
        Assert.Equal(2, byEdition["deluxe"]);

        // Покупатель Deluxe получает только Deluxe-ключ; когда они кончаются — ничего, а не ключ Standard.
        var deluxe = await keys.TryDispensePoolKeyAsync(gameId, "buyer-1", null, "deluxe");
        Assert.StartsWith("DLX-", deluxe.Key);
        Assert.Equal("deluxe", deluxe.EditionCode);
        await keys.TryDispensePoolKeyAsync(gameId, "buyer-2", null, "deluxe");
        Assert.Null(await keys.TryDispensePoolKeyAsync(gameId, "buyer-3", null, "deluxe"));

        // Базовое издание — ключ без кода; Deluxe-ключи ему не достаются.
        var baseKey = await keys.TryDispensePoolKeyAsync(gameId, "buyer-4", null, null);
        Assert.StartsWith("BASE-", baseKey.Key);
        Assert.Null(await keys.TryDispensePoolKeyAsync(gameId, "buyer-5", null, null));
    }

    [Fact]
    public async Task Dlc_is_hidden_from_the_main_catalog_and_linked_from_the_base_game()
    {
        var (baseId, baseSlug) = await SeedGameAsync(prefix: "base");
        var (dlcId, dlcSlug) = await SeedGameAsync(parentGameId: baseId, prefix: "dlc");
        var client = _factory.CreateClient();
        using (var scope = _factory.Services.CreateScope())
        {
            scope.ServiceProvider.GetRequiredService<Microsoft.Extensions.Caching.Memory.IMemoryCache>().Remove(SuperBot.WebApi.Services.CatalogSnapshotService.CacheKey);
        }

        // В общем каталоге DLC нет; с includeDlc — есть и помечено.
        var plain = await Body(await client.GetAsync($"/api/Game/catalog?q={dlcSlug}"));
        Assert.Equal(0, plain.GetProperty("total").GetInt32());
        var withDlc = await Body(await client.GetAsync($"/api/Game/catalog?q={dlcSlug}&includeDlc=true"));
        Assert.Equal(1, withDlc.GetProperty("total").GetInt32());
        Assert.True(withDlc.GetProperty("items")[0].GetProperty("isDlc").GetBoolean());

        // Страница базовой игры перечисляет DLC с ценой в валюте; страница DLC знает базовую игру.
        var basePage = await Body(await client.GetAsync($"/api/games/{baseSlug}"));
        var dlc = Assert.Single(basePage.GetProperty("dlc").EnumerateArray());
        Assert.Equal(dlcId, dlc.GetProperty("id").GetString());
        Assert.Equal(50m, dlc.GetProperty("pricing").GetProperty("price").GetDecimal());
        Assert.Equal(JsonValueKind.Null, basePage.GetProperty("parentGame").ValueKind);

        var dlcPage = await Body(await client.GetAsync($"/api/games/{dlcSlug}"));
        Assert.Equal(baseId, dlcPage.GetProperty("parentGame").GetProperty("id").GetString());
        Assert.Equal(baseSlug, dlcPage.GetProperty("parentGame").GetProperty("slug").GetString());
    }
}
