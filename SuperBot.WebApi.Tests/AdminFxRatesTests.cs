using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Страница «Currencies &amp; FX» в админке. Главное — гард на скачок и его осознанный обход:
/// робот через гард не проходит никогда, человек может, но только явным force и после того,
/// как увидел причину отказа.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class AdminFxRatesTests
{
    private readonly TaleShopApiFactory _factory;

    public AdminFxRatesTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient Admin()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "owner@taleshop.test");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        return client;
    }

    private static async Task<JsonElement> Body(HttpResponseMessage response) =>
        JsonSerializer.Deserialize<JsonElement>(await response.Content.ReadAsStringAsync());

    [Fact]
    public async Task Overview_lists_base_currency_and_guard_settings()
    {
        var overview = await Body(await Admin().GetAsync("/api/admin/fx-rates"));
        Assert.False(string.IsNullOrEmpty(overview.GetProperty("baseCurrency").GetString()));
        Assert.True(overview.GetProperty("maxChangePercent").GetDecimal() > 0);
        Assert.True(overview.TryGetProperty("rates", out _));
        Assert.True(overview.TryGetProperty("source", out _));
    }

    [Fact]
    public async Task Guard_rejects_a_jump_and_force_applies_it()
    {
        var admin = Admin();
        // Валюта, которой в конфиге тестов наверняка нет — чистая история, первый курс принимается всегда.
        const string currency = "ZZT";

        var first = await Body(await admin.PostAsJsonAsync("/api/admin/fx-rates", new { rates = new Dictionary<string, decimal> { [currency] = 100m } }));
        Assert.True(first[0].GetProperty("accepted").GetBoolean());

        // Скачок в два раза — за пределами любого разумного гарда.
        var jump = await Body(await admin.PostAsJsonAsync("/api/admin/fx-rates", new { rates = new Dictionary<string, decimal> { [currency] = 200m } }));
        Assert.False(jump[0].GetProperty("accepted").GetBoolean());
        Assert.Contains("guard", jump[0].GetProperty("reason").GetString(), StringComparison.OrdinalIgnoreCase);
        // Прежний курс остался.
        Assert.Equal(100m, jump[0].GetProperty("rate").GetDecimal());

        var forced = await Body(await admin.PostAsJsonAsync("/api/admin/fx-rates", new { rates = new Dictionary<string, decimal> { [currency] = 200m }, force = true }));
        Assert.True(forced[0].GetProperty("accepted").GetBoolean());
        Assert.Equal(200m, forced[0].GetProperty("rate").GetDecimal());

        // История хранит оба принятых снимка.
        var history = await Body(await admin.GetAsync($"/api/admin/fx-rates/{currency}/history"));
        var rates = history.EnumerateArray().Select(h => h.GetProperty("rate").GetDecimal()).ToList();
        Assert.Contains(100m, rates);
        Assert.Contains(200m, rates);
    }

    [Fact]
    public async Task Import_now_without_a_source_is_409()
    {
        var response = await Admin().PostAsync("/api/admin/fx-rates/import", null);
        // В тестовой конфигурации Storefront:Fx:Source:Url не задан — импорт запускать неоткуда.
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Requires_admin()
    {
        var support = _factory.CreateClient();
        support.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "agent@taleshop.test");
        support.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "support");
        Assert.Equal(HttpStatusCode.Forbidden, (await support.GetAsync("/api/admin/fx-rates")).StatusCode);
    }
}
