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
/// Возврат покупки отзыв не удаляет и из оценки не убирает — рядом появляется пометка «Refunded»,
/// как у Steam. Отзыв, написанный уже после возврата, получает пометку сразу.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class ReviewRefundMarkTests
{
    private readonly TaleShopApiFactory _factory;

    public ReviewRefundMarkTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient As(string email, string roles = "")
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, email);
        if (roles.Length > 0)
        {
            client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, roles);
        }
        return client;
    }

    private static async Task<JsonElement> Body(HttpResponseMessage r) => JsonSerializer.Deserialize<JsonElement>(await r.Content.ReadAsStringAsync());

    private async Task<string> SeedGameAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var slug = $"rf-{Guid.NewGuid():N}"[..16];
        var id = ObjectId.GenerateNewId().ToString();
        await games.CreateAsync(new Game { Id = id, Name = slug, Title = slug, Slug = slug, Price = 10m, Currency = "USD", ImagePath = "c.png" });
        return id;
    }

    private async Task<Guid> SeedPaidOrderAsync(string email, string gameId, string status = "DELIVERED", string paymentStatus = "PAID")
    {
        using var scope = _factory.Services.CreateScope();
        var orders = scope.ServiceProvider.GetRequiredService<IOrderRepository>();
        var id = Guid.NewGuid();
        await orders.CreateOrderAsync(new Order
        {
            Id = id, OrderNumber = $"TS-RF-{Guid.NewGuid():N}"[..12], UserId = email, UserName = email, GameId = gameId, GameName = "Game",
            IsPaid = true, IsFulfilled = true, OrderDate = DateTime.UtcNow, CreatedAt = DateTime.UtcNow, PaymentProvider = "stars",
            Status = status, PaymentStatus = paymentStatus, Currency = "USD", TotalAmount = 10m, Totals = new MoneyTotals { Total = 10m },
            Items = new List<OrderItemSnapshot> { new() { GameId = gameId, Title = "Game", Quantity = 1, UnitPrice = 10m, FinalUnitPrice = 10m, LineTotal = 10m } }
        });
        return id;
    }

    private async Task<JsonElement> StorefrontReviewAsync(string gameId, string reviewId)
    {
        var list = await Body(await _factory.CreateClient().GetAsync($"/api/games/{gameId}/reviews"));
        return list.GetProperty("items").EnumerateArray().Single(r => r.GetProperty("id").GetString() == reviewId);
    }

    [Fact]
    public async Task Refund_marks_the_review_but_keeps_it_and_its_rating()
    {
        var gameId = await SeedGameAsync();
        var buyer = $"buyer-{Guid.NewGuid():N}@taleshop.test";
        var orderId = await SeedPaidOrderAsync(buyer, gameId);

        var created = await Body(await As(buyer).PostAsJsonAsync($"/api/games/{gameId}/reviews", new { rating = 2, text = "Not for me." }));
        var reviewId = created.GetProperty("id").GetString()!;
        Assert.False((await StorefrontReviewAsync(gameId, reviewId)).GetProperty("refunded").GetBoolean());

        // Возврат «вне системы» — тот же путь пометки, что и у Stripe-возврата.
        var refund = await As("admin@taleshop.test", "admin").PostAsJsonAsync($"/api/admin/orders/{orderId}/mark-refunded", new { reason = "Returned via Stars." });
        Assert.Equal(HttpStatusCode.OK, refund.StatusCode);

        var after = await StorefrontReviewAsync(gameId, reviewId);
        Assert.True(after.GetProperty("refunded").GetBoolean());
        Assert.Equal(2, after.GetProperty("rating").GetInt32());

        // Оценка по-прежнему в сводке.
        var details = await Body(await _factory.CreateClient().GetAsync($"/api/games/{(await GameSlugAsync(gameId))}"));
        Assert.Equal(1, details.GetProperty("ratingSummary").GetProperty("count").GetInt32());
    }

    [Fact]
    public async Task Review_written_after_the_refund_is_marked_at_once()
    {
        var gameId = await SeedGameAsync();
        var buyer = $"buyer-{Guid.NewGuid():N}@taleshop.test";
        await SeedPaidOrderAsync(buyer, gameId, status: "REFUNDED", paymentStatus: "REFUNDED");

        var response = await As(buyer).PostAsJsonAsync($"/api/games/{gameId}/reviews", new { rating = 4, text = "Still liked it." });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var reviewId = (await Body(response)).GetProperty("id").GetString()!;
        Assert.True((await StorefrontReviewAsync(gameId, reviewId)).GetProperty("refunded").GetBoolean());
    }

    private async Task<string> GameSlugAsync(string gameId)
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        return (await games.GetByIdAsync(gameId))!.Slug!;
    }
}
