using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Карточка игры для витрины: наличие и скидка. Скидка берётся из GameDiscount — того же источника,
/// что у каталога и чекаута (раньше карточка читала отдельное поле без срока и могла обещать процент,
/// которого чекаут не знал). Наличие — по свободным ключам в пуле, без точного числа.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class GameDetailsStorefrontTests
{
    private readonly TaleShopApiFactory _factory;

    public GameDetailsStorefrontTests(TaleShopApiFactory factory) => _factory = factory;

    private static async Task<JsonElement> Body(HttpResponseMessage r) => JsonSerializer.Deserialize<JsonElement>(await r.Content.ReadAsStringAsync());

    private async Task<(string id, string slug)> SeedGameAsync(int? lowStockThreshold = null)
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var slug = $"sf-card-{Guid.NewGuid():N}"[..20];
        var id = ObjectId.GenerateNewId().ToString();
        await games.CreateAsync(new Game
        {
            Id = id,
            Name = slug, Title = slug, Slug = slug,
            Price = 40m, Currency = "USD",
            ImagePath = "cover.png",
            ReleaseDate = DateTime.UtcNow.AddYears(-1),
            LowStockThreshold = lowStockThreshold
        });
        return (id, slug);
    }

    /// <summary>
    /// «More like this» — та же карточка, что на полках главной: платформы, наличие, цена в валюте
    /// и статус скидки. Витрина рисует их общей полкой, а не своей урезанной карточкой.
    /// </summary>
    [Fact]
    public async Task Recommendations_are_full_storefront_cards()
    {
        var (_, slug) = await SeedGameAsync();
        await SeedGameAsync();
        var client = _factory.CreateClient();

        var page = await Body(await client.GetAsync($"/api/games/{slug}?currency=USD"));
        var cards = page.GetProperty("recommendations").GetProperty("moreLikeThis").EnumerateArray().ToList();
        Assert.NotEmpty(cards);
        foreach (var card in cards)
        {
            // null-поля сериализатор опускает: у части сеяных игр валюты нет — проверяем, только когда она есть.
            if (card.TryGetProperty("currency", out var cardCurrency))
            {
                Assert.Equal("USD", cardCurrency.GetString());
            }
            Assert.True(card.TryGetProperty("finalPrice", out _));
            Assert.True(card.TryGetProperty("platforms", out _));
            Assert.True(card.TryGetProperty("inStock", out _));
            Assert.True(card.TryGetProperty("discountActive", out _));
            Assert.True(card.TryGetProperty("imagePath", out _));
        }
    }

    private async Task AddKeysAsync(string gameId, int count)
    {
        using var scope = _factory.Services.CreateScope();
        var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();
        await keys.AddPoolKeysAsync(gameId, "Steam", Enumerable.Range(0, count).Select(_ => $"KEY-{Guid.NewGuid():N}"[..20]));
    }

    [Fact]
    public async Task Availability_follows_free_keys_and_threshold()
    {
        var (id, slug) = await SeedGameAsync(lowStockThreshold: 2);
        var client = _factory.CreateClient();

        var empty = await Body(await client.GetAsync($"/api/games/{slug}"));
        Assert.Equal("outOfStock", empty.GetProperty("availability").GetProperty("status").GetString());

        await AddKeysAsync(id, 2);
        var low = await Body(await client.GetAsync($"/api/games/{slug}"));
        Assert.Equal("lowStock", low.GetProperty("availability").GetProperty("status").GetString());

        await AddKeysAsync(id, 5);
        var ok = await Body(await client.GetAsync($"/api/games/{slug}"));
        Assert.Equal("inStock", ok.GetProperty("availability").GetProperty("status").GetString());
        // Точное число ключей наружу не уходит.
        Assert.False(ok.GetProperty("availability").TryGetProperty("keysLeft", out _));
    }

    [Fact]
    public async Task Discount_comes_from_game_discount_with_its_deadline()
    {
        var (id, slug) = await SeedGameAsync();
        var client = _factory.CreateClient();

        var plain = await Body(await client.GetAsync($"/api/games/{slug}"));
        Assert.Equal(40m, plain.GetProperty("pricing").GetProperty("price").GetDecimal());
        Assert.Equal(JsonValueKind.Null, plain.GetProperty("pricing").GetProperty("discountPercent").ValueKind);

        var endsAt = DateTime.UtcNow.AddDays(3);
        using (var scope = _factory.Services.CreateScope())
        {
            var discounts = scope.ServiceProvider.GetRequiredService<IGameDiscountRepository>();
            await discounts.UpsertAsync(new GameDiscount { GameId = id, DiscountPercent = 25m, StartDate = DateTime.UtcNow.AddDays(-1), EndDate = endsAt });
        }

        var discounted = await Body(await client.GetAsync($"/api/games/{slug}"));
        var pricing = discounted.GetProperty("pricing");
        Assert.Equal(25m, pricing.GetProperty("discountPercent").GetDecimal());
        Assert.Equal(30m, pricing.GetProperty("price").GetDecimal());
        Assert.Equal(40m, pricing.GetProperty("oldPrice").GetDecimal());
        Assert.Equal(endsAt, pricing.GetProperty("discountEndsAt").GetDateTime().ToUniversalTime(), TimeSpan.FromSeconds(1));
        // Плашек над заголовком (heroBadges) больше нет: скидку показывает только карточка покупки.
        Assert.False(discounted.TryGetProperty("heroBadges", out _));

        // Истёкшая скидка не действует.
        using (var scope = _factory.Services.CreateScope())
        {
            var discounts = scope.ServiceProvider.GetRequiredService<IGameDiscountRepository>();
            await discounts.UpsertAsync(new GameDiscount { GameId = id, DiscountPercent = 25m, StartDate = DateTime.UtcNow.AddDays(-5), EndDate = DateTime.UtcNow.AddDays(-1) });
        }
        var expired = await Body(await client.GetAsync($"/api/games/{slug}"));
        Assert.Equal(40m, expired.GetProperty("pricing").GetProperty("price").GetDecimal());
    }
}
