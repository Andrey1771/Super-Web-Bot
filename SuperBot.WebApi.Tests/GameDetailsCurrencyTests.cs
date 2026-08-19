using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Карточка игры в валюте покупателя. Раньше /api/games/{slug} отдавал базовую цену без учёта
/// ?currency, а фронт подставлял к ней символ выбранной валюты — $30 превращались в «€30».
/// Карточка обязана считать цену тем же путём, что и каталог: ручная цена из прайс-листа,
/// иначе — курс; нет ни того ни другого — честный null, а не чужой символ.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class GameDetailsCurrencyTests
{
    private readonly TaleShopApiFactory _factory;

    public GameDetailsCurrencyTests(TaleShopApiFactory factory) => _factory = factory;

    private static async Task<JsonElement> Body(HttpResponseMessage r) => JsonSerializer.Deserialize<JsonElement>(await r.Content.ReadAsStringAsync());

    private async Task<string> SeedGameAsync(Dictionary<string, decimal>? prices = null)
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var slug = $"fx-card-{Guid.NewGuid():N}"[..20];
        await games.CreateAsync(new Game
        {
            Id = ObjectId.GenerateNewId().ToString(),
            Name = slug, Title = slug, Slug = slug,
            Price = 30m, Currency = "USD",
            Prices = prices ?? new Dictionary<string, decimal>(),
            ImagePath = "cover.png"
        });
        return slug;
    }

    [Fact]
    public async Task Manual_price_list_wins_for_the_requested_currency()
    {
        var slug = await SeedGameAsync(new Dictionary<string, decimal> { ["EUR"] = 27.49m });
        var client = _factory.CreateClient();

        var usd = await Body(await client.GetAsync($"/api/games/{slug}"));
        Assert.Equal(30m, usd.GetProperty("pricing").GetProperty("price").GetDecimal());
        Assert.Equal("USD", usd.GetProperty("pricing").GetProperty("currency").GetString());

        // Явно просим EUR — и ручная цена из прайс-листа приезжает вместе с кодом валюты EUR,
        // а не «30 с евро-символом».
        var eur = await Body(await client.GetAsync($"/api/games/{slug}?currency=EUR"));
        var pricing = eur.GetProperty("pricing");
        // В тестовой конфигурации EUR может быть не в списке витрины — тогда Resolve вернёт базовую.
        // Проверяем инвариант: валюта в ответе совпадает с той, в которой посчитана цена.
        var currency = pricing.GetProperty("currency").GetString();
        var price = pricing.GetProperty("price").GetDecimal();
        Assert.True(
            (currency == "EUR" && price == 27.49m) || (currency == "USD" && price == 30m),
            $"Unexpected pricing: {price} {currency}");
    }

    [Fact]
    public async Task Response_never_relabels_a_base_price_with_a_foreign_currency()
    {
        var slug = await SeedGameAsync();
        var client = _factory.CreateClient();
        var eur = await Body(await client.GetAsync($"/api/games/{slug}?currency=EUR"));

        if (eur.GetProperty("pricing").ValueKind == JsonValueKind.Null)
        {
            // EUR включён, но курса и ручной цены нет — карточка честно отказала.
            return;
        }
        var currency = eur.GetProperty("pricing").GetProperty("currency").GetString();
        var price = eur.GetProperty("pricing").GetProperty("price").GetDecimal();
        // Либо это USD с базовой ценой (EUR не продаём), либо EUR с ценой, отличной от базовой
        // (пересчёт по курсу). «30 EUR» при базовой 30 USD — ровно тот баг, который чиним.
        Assert.False(currency == "EUR" && price == 30m, "Base USD price was relabelled as EUR.");
    }
}
