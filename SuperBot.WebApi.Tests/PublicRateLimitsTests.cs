using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Анонимные формы ограничены по частоте на адрес клиента (X-Real-IP от nginx): перебор промокодов
/// упирается в 429 с кодом RATE_LIMITED, а соседний адрес не страдает.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class PublicRateLimitsTests
{
    private readonly TaleShopApiFactory _factory;

    public PublicRateLimitsTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient From(string ip)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Real-IP", ip);
        return client;
    }

    [Fact]
    public async Task Promo_validation_is_limited_per_client_address()
    {
        var attacker = From($"203.0.113.{Random.Shared.Next(1, 250)}");
        HttpResponseMessage? last = null;
        for (var i = 0; i < 11; i++)
        {
            last = await attacker.PostAsJsonAsync("/api/promo/validate", new { code = $"GUESS{i}", cartSubtotal = 10m });
        }

        Assert.Equal(HttpStatusCode.TooManyRequests, last!.StatusCode);
        var body = await last.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("RATE_LIMITED", body.GetProperty("code").GetString());

        // Подделанный X-Forwarded-For не уводит от лимита: счёт идёт по X-Real-IP.
        attacker.DefaultRequestHeaders.Add("X-Forwarded-For", "198.51.100.7");
        Assert.Equal(HttpStatusCode.TooManyRequests, (await attacker.PostAsJsonAsync("/api/promo/validate", new { code = "X", cartSubtotal = 10m })).StatusCode);

        var neighbour = From($"198.51.100.{Random.Shared.Next(1, 250)}");
        Assert.NotEqual(HttpStatusCode.TooManyRequests, (await neighbour.PostAsJsonAsync("/api/promo/validate", new { code = "X", cartSubtotal = 10m })).StatusCode);
    }

    [Fact]
    public async Task Removed_legacy_endpoints_stay_removed()
    {
        var admin = _factory.CreateClient();
        admin.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "owner@taleshop.test");
        admin.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");

        // Список пользователей бота с балансами, реферальный редирект-заглушка, старая форма вопроса,
        // дублирующая медиатеку загрузка картинок и CRUD заказов в обход оплаты.
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync("/api/user")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync("/api/Referral/1")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PostAsJsonAsync("/api/ChatBot", new { question = "q" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync("/api/deal-of-week")).StatusCode);
        Assert.NotEqual(HttpStatusCode.OK, (await admin.PostAsJsonAsync("/api/order", new { })).StatusCode);
        Assert.NotEqual(HttpStatusCode.OK, (await admin.DeleteAsync("/api/order/000000000000000000000000")).StatusCode);
    }

    [Fact]
    public async Task Blog_search_treats_the_query_as_text()
    {
        var response = await _factory.CreateClient().GetAsync("/api/blog/posts?search=%5B(a%2B)%2B%24");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
