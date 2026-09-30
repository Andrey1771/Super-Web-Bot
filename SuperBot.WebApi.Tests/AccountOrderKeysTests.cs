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
/// Ключи не должны пропасть вместе с письмом: кабинет показывает их целиком по запросу и
/// умеет переслать письмо на адрес аккаунта. Строка заказа ведёт на игру по каталогу сейчас,
/// а снятый с продажи товар остаётся в истории без ссылки.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class AccountOrderKeysTests
{
    private readonly TaleShopApiFactory _factory;

    public AccountOrderKeysTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient As(string email)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, email);
        return client;
    }

    private static async Task<JsonElement> Body(HttpResponseMessage r) => JsonSerializer.Deserialize<JsonElement>(await r.Content.ReadAsStringAsync());

    private async Task<(string id, string slug)> SeedGameAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var slug = $"keys-{Guid.NewGuid():N}"[..18];
        var id = ObjectId.GenerateNewId().ToString();
        await games.CreateAsync(new Game { Id = id, Name = slug, Title = slug, Slug = slug, Price = 10m, Currency = "USD", ImagePath = "c.png" });
        return (id, slug);
    }

    /// <summary>Оплаченный заказ с выданным ключом: в заказе — маска, у пользователя — полный ключ.</summary>
    private async Task<Guid> SeedDeliveredOrderAsync(string email, string gameId, string key, string? goneGameId = null)
    {
        using var scope = _factory.Services.CreateScope();
        var orders = scope.ServiceProvider.GetRequiredService<IOrderRepository>();
        var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();
        var orderId = Guid.NewGuid();
        var items = new List<OrderItemSnapshot>
        {
            new()
            {
                GameId = gameId, Title = "Game", Quantity = 1, UnitPrice = 10m, FinalUnitPrice = 10m, LineTotal = 10m,
                Delivery = new DeliverySnapshot { DeliveryType = "Key", DeliveredAt = DateTime.UtcNow, Keys = { new DeliveredKey { KeyMasked = new string('•', key.Length - 4) + key[^4..], DeliveredAt = DateTime.UtcNow } } }
            }
        };
        if (goneGameId is not null)
        {
            items.Add(new OrderItemSnapshot { GameId = goneGameId, Title = "Gone Game", Slug = "gone-game", Quantity = 1, UnitPrice = 5m, FinalUnitPrice = 5m, LineTotal = 5m });
        }
        await orders.CreateOrderAsync(new Order
        {
            Id = orderId, OrderNumber = $"TS-KEYS-{Guid.NewGuid():N}"[..14], UserId = email, UserName = email, GameId = gameId, GameName = "Game",
            IsPaid = true, IsFulfilled = true, OrderDate = DateTime.UtcNow, CreatedAt = DateTime.UtcNow,
            Status = "DELIVERED", PaymentStatus = "PAID", Currency = "USD", TotalAmount = 15m, Totals = new MoneyTotals { Total = 15m },
            Items = items
        });
        await keys.AddAsync(new GameKey { UserId = email, GameId = gameId, Key = key, KeyType = "Steam", IssuedAt = DateTime.UtcNow, IsActive = true, OrderId = orderId.ToString() });
        return orderId;
    }

    [Fact]
    public async Task Order_shows_masked_keys_and_reveals_full_ones_only_to_the_owner()
    {
        var (gameId, slug) = await SeedGameAsync();
        var owner = $"owner-{Guid.NewGuid():N}@taleshop.test";
        var key = "AAAAA-BBBBB-CCCCC";
        var orderId = await SeedDeliveredOrderAsync(owner, gameId, key, goneGameId: ObjectId.GenerateNewId().ToString());

        var details = await Body(await As(owner).GetAsync($"/api/account/orders/{orderId}"));
        var lines = details.GetProperty("items").EnumerateArray().ToList();
        var live = lines.Single(l => l.GetProperty("title").GetString() == "Game");
        Assert.EndsWith("CCCC", live.GetProperty("keys")[0].GetString());
        Assert.DoesNotContain("AAAAA", live.GetProperty("keys")[0].GetString());
        // Ссылка — по каталогу сейчас; снятый товар остаётся в истории, но без ссылки.
        Assert.Equal(slug, live.GetProperty("slug").GetString());
        Assert.True(live.GetProperty("available").GetBoolean());
        var gone = lines.Single(l => l.GetProperty("title").GetString() == "Gone Game");
        Assert.False(gone.GetProperty("available").GetBoolean());
        Assert.Equal(JsonValueKind.Null, gone.GetProperty("slug").ValueKind);

        // Без пароля или с неверным — ключей нет, и попытка считается.
        var wrong = await As(owner).PostAsJsonAsync($"/api/account/orders/{orderId}/keys/reveal", new { password = "nope" });
        Assert.Equal(HttpStatusCode.BadRequest, wrong.StatusCode);
        var wrongBody = await Body(wrong);
        Assert.Contains("Invalid password", wrongBody.GetProperty("message").GetString());
        // Код и подстановки — витрина переводит причину на язык покупателя; текст остаётся запасом.
        Assert.Equal("order.wrongPassword", wrongBody.GetProperty("code").GetString());
        Assert.True(wrongBody.GetProperty("args").GetProperty("count").GetInt32() > 0);

        var revealed = await Body(await As(owner).PostAsJsonAsync($"/api/account/orders/{orderId}/keys/reveal", new { password = FakePasswordVerifier.CorrectPassword }));
        var revealedLine = Assert.Single(revealed.GetProperty("items").EnumerateArray());
        Assert.Equal(live.GetProperty("itemId").GetString(), revealedLine.GetProperty("itemId").GetString());
        Assert.Equal(key, revealedLine.GetProperty("keys")[0].GetString());

        // Показ попал в журнал заказа.
        using (var scope = _factory.Services.CreateScope())
        {
            var stored = await scope.ServiceProvider.GetRequiredService<IOrderRepository>().GetOrderByIdAsync(orderId.ToString());
            var viewed = Assert.Single(stored!.Events, e => e.Type == "keys_viewed");
            Assert.Equal(owner, viewed.Actor);
        }

        // Чужой заказ — как несуществующий, даже с верным паролем.
        Assert.Equal(HttpStatusCode.NotFound, (await As($"other-{Guid.NewGuid():N}@taleshop.test").PostAsJsonAsync($"/api/account/orders/{orderId}/keys/reveal", new { password = FakePasswordVerifier.CorrectPassword })).StatusCode);
    }

    [Fact]
    public async Task Five_wrong_passwords_lock_the_reveal_for_a_while()
    {
        var (gameId, _) = await SeedGameAsync();
        var owner = $"owner-{Guid.NewGuid():N}@taleshop.test";
        var orderId = await SeedDeliveredOrderAsync(owner, gameId, "GGGGG-HHHHH-IIIII");

        for (var attempt = 0; attempt < 5; attempt++)
        {
            Assert.Equal(HttpStatusCode.BadRequest, (await As(owner).PostAsJsonAsync($"/api/account/orders/{orderId}/keys/reveal", new { password = "wrong" })).StatusCode);
        }
        // Шестая попытка — даже с верным паролем — отказ на время.
        Assert.Equal(HttpStatusCode.TooManyRequests, (await As(owner).PostAsJsonAsync($"/api/account/orders/{orderId}/keys/reveal", new { password = FakePasswordVerifier.CorrectPassword })).StatusCode);
    }

    [Fact]
    public async Task Customer_can_resend_the_key_email_to_the_account_address_with_a_cooldown()
    {
        var (gameId, _) = await SeedGameAsync();
        var owner = $"owner-{Guid.NewGuid():N}@taleshop.test";
        var key = "DDDDD-EEEEE-FFFFF";
        var orderId = await SeedDeliveredOrderAsync(owner, gameId, key);
        _factory.Mail.Clear();

        var first = await As(owner).PostAsync($"/api/account/orders/{orderId}/resend-keys", null);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var body = await Body(first);
        Assert.Equal(1, body.GetProperty("count").GetInt32());
        Assert.StartsWith("ow***@", body.GetProperty("sentTo").GetString());

        var mail = Assert.Single(_factory.Mail.AllTo(owner));
        Assert.Contains(key, mail.TextBody);

        // Второй раз подряд — отказ с паузой, письмо не дублируется.
        var second = await As(owner).PostAsync($"/api/account/orders/{orderId}/resend-keys", null);
        Assert.Equal(HttpStatusCode.TooManyRequests, second.StatusCode);
        Assert.Single(_factory.Mail.AllTo(owner));

        // Чужому — 404, письма нет.
        var stranger = $"other-{Guid.NewGuid():N}@taleshop.test";
        Assert.Equal(HttpStatusCode.NotFound, (await As(stranger).PostAsync($"/api/account/orders/{orderId}/resend-keys", null)).StatusCode);
        Assert.Empty(_factory.Mail.AllTo(stranger));
    }
}
