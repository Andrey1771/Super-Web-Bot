using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Regions;
using SuperBot.Infrastructure.Services;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Регионы активации насквозь: карточка говорит, где ключ работает и подходит ли стране покупателя;
/// чекаут отказывает стране, где ключ не активируется; выдача берёт ключ под страну покупателя.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class RegionActivationTests
{
    private readonly TaleShopApiFactory _factory;

    public RegionActivationTests(TaleShopApiFactory factory) => _factory = factory;

    private static async Task<JsonElement> Body(HttpResponseMessage r) => JsonSerializer.Deserialize<JsonElement>(await r.Content.ReadAsStringAsync());

    private async Task<(string id, string slug)> SeedGameAsync(RegionPolicy? policy)
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var slug = $"rg-{Guid.NewGuid():N}"[..20];
        var id = ObjectId.GenerateNewId().ToString();
        await games.CreateAsync(new Game { Id = id, Name = slug, Title = slug, Slug = slug, Price = 20m, Currency = "USD", ImagePath = "c.png", ReleaseDate = DateTime.UtcNow.AddYears(-1), RegionPolicy = policy });
        return (id, slug);
    }

    [Fact]
    public async Task Card_reports_region_policy_and_whether_the_buyer_country_fits()
    {
        var (_, slug) = await SeedGameAsync(new RegionPolicy { Mode = "Regions", Regions = new() { "EU" }, ExcludedCountries = new() { "UA" } });
        var client = _factory.CreateClient();

        var anonymous = await Body(await client.GetAsync($"/api/games/{slug}"));
        var info = anonymous.GetProperty("regionInfo");
        Assert.Equal("Regions", info.GetProperty("mode").GetString());
        Assert.Equal(JsonValueKind.Null, info.GetProperty("allowed").ValueKind);
        Assert.Contains("Europe", info.GetProperty("summary").GetString());
        Assert.Equal("Not in UA", info.GetProperty("exclusions").GetString());
        // Код вида и списки — из них витрина собирает подпись на языке покупателя.
        Assert.Equal("regions", info.GetProperty("kind").GetString());
        Assert.Equal("Europe", info.GetProperty("regionNames")[0].GetString());
        Assert.Equal("UA", info.GetProperty("excludedCountries")[0].GetString());

        client.DefaultRequestHeaders.Add("X-Buyer-Country", "DE");
        var german = await Body(await client.GetAsync($"/api/games/{slug}"));
        Assert.True(german.GetProperty("regionInfo").GetProperty("allowed").GetBoolean());
        Assert.Equal("DE", german.GetProperty("regionInfo").GetProperty("buyerCountry").GetString());

        client.DefaultRequestHeaders.Remove("X-Buyer-Country");
        client.DefaultRequestHeaders.Add("X-Buyer-Country", "JP");
        var japanese = await Body(await client.GetAsync($"/api/games/{slug}"));
        Assert.False(japanese.GetProperty("regionInfo").GetProperty("allowed").GetBoolean());
    }

    [Fact]
    public async Task Card_and_cart_follow_the_region_of_the_keys_in_stock_not_only_the_game()
    {
        // Магазин ограничил не игру, а партию: «продаём везде, кроме России». Витрина обязана
        // говорить то же самое — иначе карточка обещает активацию там, где ключ не сработает,
        // и покупатель узнаёт правду только после оплаты.
        var (gameId, slug) = await SeedGameAsync(null);
        using (var scope = _factory.Services.CreateScope())
        {
            var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();
            await keys.AddPoolKeysAsync(gameId, "Steam", new[] { "BATCH-0001-AAAA" },
                regionPolicy: new RegionPolicy { Mode = "Global", ExcludedCountries = new() { "RU" } });

            // Корзина читает каталог из общего снимка, а он живёт две минуты и в общем прогоне
            // тестов уже собран без этой игры. В жизни его сбрасывает сохранение из админки.
            scope.ServiceProvider.GetRequiredService<SuperBot.WebApi.Services.ICatalogSnapshotService>().Invalidate();
        }

        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Buyer-Country", "RU");

        // Страница игры.
        var page = await Body(await client.GetAsync($"/api/games/{slug}"));
        var info = page.GetProperty("regionInfo");
        Assert.False(info.GetProperty("allowed").GetBoolean());
        Assert.Equal("Not in RU", info.GetProperty("exclusions").GetString());

        // Корзина.
        var cart = await Body(await client.PostAsJsonAsync("/api/storefront/region/check", new { gameIds = new[] { gameId } }));
        var line = cart.GetProperty("items").EnumerateArray().Single();
        Assert.False(line.GetProperty("allowed").GetBoolean());
        Assert.Equal("Not in RU", line.GetProperty("exclusions").GetString());
        Assert.Equal("worldwide", line.GetProperty("kind").GetString());
        Assert.Equal("RU", line.GetProperty("excludedCountries")[0].GetString());

        // Покупателю из страны, где ключ работает, тот же товар не запрещаем.
        var german = _factory.CreateClient();
        german.DefaultRequestHeaders.Add("X-Buyer-Country", "DE");
        var allowed = await Body(await german.PostAsJsonAsync("/api/storefront/region/check", new { gameIds = new[] { gameId } }));
        Assert.True(allowed.GetProperty("items").EnumerateArray().Single().GetProperty("allowed").GetBoolean());
    }

    [Fact]
    public async Task Checkout_rejects_a_country_where_the_key_will_not_activate()
    {
        var (gameId, _) = await SeedGameAsync(new RegionPolicy { Mode = "Global", ExcludedCountries = new() { "RU" } });
        using var scope = _factory.Services.CreateScope();
        var pricing = scope.ServiceProvider.GetRequiredService<ICheckoutPricingService>();

        var blocked = await pricing.PriceAsync(new CheckoutPricingRequest { Items = new() { new() { GameId = gameId, Quantity = 1 } }, UserName = "u", BuyerCountry = "RU" });
        Assert.False(blocked.Success);
        Assert.Contains("RU", blocked.Error);

        var allowed = await pricing.PriceAsync(new CheckoutPricingRequest { Items = new() { new() { GameId = gameId, Quantity = 1 } }, UserName = "u", BuyerCountry = "DE" });
        Assert.True(allowed.Success, allowed.Error);
        Assert.Equal("DE", allowed.BuyerCountry);

        // Страна неизвестна — не блокируем (проверить нечем), но и в результате её нет.
        var unknown = await pricing.PriceAsync(new CheckoutPricingRequest { Items = new() { new() { GameId = gameId, Quantity = 1 } }, UserName = "u" });
        Assert.True(unknown.Success, unknown.Error);
        Assert.Null(unknown.BuyerCountry);
    }

    [Fact]
    public async Task Keys_are_dispensed_by_buyer_country_using_key_or_game_policy()
    {
        var (gameId, _) = await SeedGameAsync(new RegionPolicy { Mode = "Global", ExcludedCountries = new() { "CN" } });
        using var scope = _factory.Services.CreateScope();
        var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();

        // Партия «только EU» + партия под политику игры (везде, кроме CN).
        await keys.AddPoolKeysAsync(gameId, "Steam", new[] { "EU-ONLY-0001-AAAA" }, regionPolicy: new RegionPolicy { Mode = "Regions", Regions = new() { "EU" } });
        await keys.AddPoolKeysAsync(gameId, "Steam", new[] { "ANY-0001-AAAA-BBBB" });

        var stats = await keys.CountAvailableByRegionPolicyAsync(gameId);
        Assert.Contains(stats, s => s.Summary == "EU" && s.Available == 1);
        Assert.Contains(stats, s => s.Summary == "Game default" && s.Available == 1);

        // Американцу EU-ключ не подходит — он получает «любой»; европейцу достаётся оставшийся EU-ключ.
        var us = await keys.TryDispensePoolKeyAsync(gameId, "us-buyer", null, null, "US");
        Assert.StartsWith("ANY-", us.Key);
        var de = await keys.TryDispensePoolKeyAsync(gameId, "de-buyer", null, null, "DE");
        Assert.StartsWith("EU-ONLY-", de.Key);

        // Китайцу не подходит ничего: политика игры исключает CN, а EU-партия — только Европа.
        await keys.AddPoolKeysAsync(gameId, "Steam", new[] { "ANY-0002-AAAA-BBBB" });
        Assert.Null(await keys.TryDispensePoolKeyAsync(gameId, "cn-buyer", null, null, "CN"));
        // Без страны — первый свободный.
        Assert.NotNull(await keys.TryDispensePoolKeyAsync(gameId, "unknown-buyer"));
    }

    [Fact]
    public async Task Storefront_region_endpoint_lists_countries_and_regions()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("CF-IPCountry", "PL");
        var body = await Body(await client.GetAsync("/api/storefront/region"));
        Assert.Equal("PL", body.GetProperty("detectedCountry").GetString());
        Assert.Equal("PL", body.GetProperty("buyerCountry").GetString());
        Assert.Contains(body.GetProperty("countries").EnumerateArray(), c => c.GetProperty("code").GetString() == "DE");
        Assert.Contains(body.GetProperty("regions").EnumerateArray(), r => r.GetProperty("code").GetString() == "EU");
    }
}
