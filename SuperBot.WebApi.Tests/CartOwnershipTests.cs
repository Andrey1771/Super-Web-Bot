using System.Net;
using System.Net.Http.Json;
using SuperBot.WebApi.Mail;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Серверная корзина — только своя. Раньше любой, даже без входа, мог по чужой почте прочитать, подменить или очистить
/// корзину: адрес /api/cart/{почта} ничем не сверялся с тем, кто спрашивает.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class CartOwnershipTests
{
    private readonly TaleShopApiFactory _factory;

    public CartOwnershipTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient As(string email)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, email);
        return client;
    }

    [Fact]
    public async Task Cart_is_reachable_only_by_its_owner()
    {
        var owner = $"cart-{Guid.NewGuid():N}@taleshop.test";
        var stranger = $"stranger-{Guid.NewGuid():N}@taleshop.test";
        var gameId = MongoDB.Bson.ObjectId.GenerateNewId().ToString();
        var cart = new { userId = owner, cartGames = new[] { new { gameId, name = "Game", price = 10m, quantity = 1, image = "c.png" } } };

        Assert.Equal(HttpStatusCode.OK, (await As(owner).PostAsJsonAsync($"/api/cart/{owner}", cart)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await As(owner).GetAsync($"/api/cart/{owner}")).StatusCode);

        // Чужому — «не найдено» на всё: не читает, не подменяет, не очищает.
        Assert.Equal(HttpStatusCode.NotFound, (await As(stranger).GetAsync($"/api/cart/{owner}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await As(stranger).PostAsJsonAsync($"/api/cart/{owner}", cart)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await As(stranger).DeleteAsync($"/api/cart/{owner}")).StatusCode);

        // Без входа — тем более.
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateClient().GetAsync($"/api/cart/{owner}")).StatusCode);

        var kept = await (await As(owner).GetAsync($"/api/cart/{owner}")).Content.ReadAsStringAsync();
        Assert.Contains(gameId, kept);
    }

    [Theory]
    [InlineData("demo-admin@taleshop-demo.invalid", true)]
    [InlineData("buyer7@example.com", true)]
    [InlineData("someone@mail.example.org", true)]
    [InlineData("qa@shop.test", true)]
    [InlineData("john@gmail.com", false)]
    [InlineData("support@tale-shop.com", false)]
    [InlineData("anna@examples.com", false)]
    public void Mail_is_never_sent_to_reserved_domains(string address, bool undeliverable) =>
        Assert.Equal(undeliverable, SmtpMailSender.IsUndeliverable(address));
}
