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
/// Прайс-лист в админке: матрица игра × валюта. Сторожим смысл ячейки — её источник: база,
/// ручная, по курсу, «не продаётся» — и то, что правка ячейки реально меняет прайс-лист игры,
/// а очистка возвращает к курсу.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class AdminPricesTests
{
    private readonly TaleShopApiFactory _factory;

    public AdminPricesTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient Admin()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "owner@taleshop.test");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        return client;
    }

    private static async Task<JsonElement> Body(HttpResponseMessage r) => JsonSerializer.Deserialize<JsonElement>(await r.Content.ReadAsStringAsync());

    private async Task<string> SeedGameAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var id = ObjectId.GenerateNewId().ToString();
        var title = $"Priced Game {Guid.NewGuid():N}"[..24];
        await games.CreateAsync(new Game { Id = id, Name = title, Title = title, Price = 20m, Currency = "USD", ImagePath = "c.png" });
        return id;
    }

    [Fact]
    public async Task Matrix_marks_base_cell_and_lets_manual_price_be_set_and_cleared()
    {
        var gameId = await SeedGameAsync();
        var admin = Admin();

        var matrix = await Body(await admin.GetAsync("/api/admin/prices"));
        var baseCurrency = matrix.GetProperty("baseCurrency").GetString()!;
        var row = matrix.GetProperty("games").EnumerateArray().Single(g => g.GetProperty("gameId").GetString() == gameId);
        var baseCell = row.GetProperty("cells").GetProperty(baseCurrency);
        Assert.Equal("base", baseCell.GetProperty("source").GetString());
        Assert.Equal(20m, baseCell.GetProperty("price").GetDecimal());

        // Какая-нибудь не-базовая валюта витрины, если она есть в тестовой конфигурации.
        var other = matrix.GetProperty("currencies").EnumerateArray().Select(c => c.GetString()!).FirstOrDefault(c => c != baseCurrency);
        if (other is null)
        {
            // Витрина с одной валютой: проверяем хотя бы, что чужую валюту отвергают.
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/admin/prices/{gameId}/ZZZ", new { price = 1m })).StatusCode);
            return;
        }

        // Ручная цена — ячейка становится manual.
        var set = await Body(await admin.PutAsJsonAsync($"/api/admin/prices/{gameId}/{other}", new { price = 17.49m }));
        Assert.Equal("manual", set.GetProperty("cell").GetProperty("source").GetString());
        Assert.Equal(17.49m, set.GetProperty("cell").GetProperty("price").GetDecimal());

        // И витрина её видит.
        var card = await Body(await _factory.CreateClient().GetAsync($"/api/Game/catalog?currency={other}"));
        var item = card.GetProperty("items").EnumerateArray().FirstOrDefault(i => i.GetProperty("id").GetString() == gameId);
        if (item.ValueKind != JsonValueKind.Undefined)
        {
            Assert.Equal(17.49m, item.GetProperty("price").GetDecimal());
        }

        // Очистили — источник уже не manual (rate или none, смотря есть ли курс).
        var cleared = await Body(await admin.PutAsJsonAsync($"/api/admin/prices/{gameId}/{other}", new { price = (decimal?)null }));
        Assert.NotEqual("manual", cleared.GetProperty("cell").GetProperty("source").GetString());
    }

    [Fact]
    public async Task Base_price_cannot_be_cleared_and_negative_is_rejected()
    {
        var gameId = await SeedGameAsync();
        var admin = Admin();
        var matrix = await Body(await admin.GetAsync("/api/admin/prices"));
        var baseCurrency = matrix.GetProperty("baseCurrency").GetString()!;

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/admin/prices/{gameId}/{baseCurrency}", new { price = (decimal?)null })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/admin/prices/{gameId}/{baseCurrency}", new { price = -1m })).StatusCode);

        var ok = await Body(await admin.PutAsJsonAsync($"/api/admin/prices/{gameId}/{baseCurrency}", new { price = 25m }));
        Assert.Equal(25m, ok.GetProperty("cell").GetProperty("price").GetDecimal());
    }

    [Fact]
    public async Task Requires_admin()
    {
        var support = _factory.CreateClient();
        support.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "agent@taleshop.test");
        support.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "support");
        Assert.Equal(HttpStatusCode.Forbidden, (await support.GetAsync("/api/admin/prices")).StatusCode);
    }
}
