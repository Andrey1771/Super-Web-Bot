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
/// Отзыв может оставить только покупатель игры: иначе «Verified purchase» ничего не значит.
/// Сводка отзывов отдаёт долю рекомендующих — для «N% recommend» на странице. Вердикт отзыва выводится
/// из звёзд: 4–5 — за, 1–2 — против, 3 — нейтрально; клиентская галочка не принимается.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class GameReviewPurchaseGateTests
{
    private readonly TaleShopApiFactory _factory;

    public GameReviewPurchaseGateTests(TaleShopApiFactory factory) => _factory = factory;

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
        var slug = $"rv-gate-{Guid.NewGuid():N}"[..20];
        var id = ObjectId.GenerateNewId().ToString();
        await games.CreateAsync(new Game { Id = id, Name = slug, Title = slug, Slug = slug, Price = 10m, Currency = "USD", ImagePath = "c.png", ReleaseDate = DateTime.UtcNow.AddYears(-1) });
        return (id, slug);
    }

    private async Task SeedPaidOrderAsync(string email, string gameId)
    {
        using var scope = _factory.Services.CreateScope();
        var orders = scope.ServiceProvider.GetRequiredService<IOrderRepository>();
        await orders.CreateOrderAsync(new Order
        {
            Id = Guid.NewGuid(), OrderNumber = $"TS-RV-{Guid.NewGuid():N}"[..12], UserId = email, UserName = email, GameId = gameId, GameName = "Game",
            IsPaid = true, IsFulfilled = true, OrderDate = DateTime.UtcNow.AddDays(-1), CreatedAt = DateTime.UtcNow.AddDays(-1),
            Status = "DELIVERED", PaymentStatus = "PAID", Currency = "USD", TotalAmount = 10m, Totals = new MoneyTotals { Total = 10m },
            Items = new List<OrderItemSnapshot> { new() { GameId = gameId, Title = "Game", Quantity = 1 } }
        });
    }

    [Fact]
    public async Task Only_buyers_can_review_and_summary_reports_recommend_share()
    {
        var (gameId, slug) = await SeedGameAsync();
        var stranger = $"stranger-{Guid.NewGuid():N}@taleshop.test";
        var buyer = $"buyer-{Guid.NewGuid():N}@taleshop.test";
        await SeedPaidOrderAsync(buyer, gameId);

        var denied = await As(stranger).PostAsJsonAsync($"/api/games/{gameId}/reviews", new { rating = 5, text = "Great!" });
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);

        var allowed = await As(buyer).PostAsJsonAsync($"/api/games/{gameId}/reviews", new { rating = 4, text = "Solid game." });
        Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);
        Assert.True((await Body(allowed)).GetProperty("verifiedPurchase").GetBoolean());

        // Карточка для покупателя знает про его отзыв и покупку; сводка — про долю рекомендующих.
        var details = await Body(await As(buyer).GetAsync($"/api/games/{slug}"));
        Assert.True(details.GetProperty("userContext").GetProperty("hasPurchased").GetBoolean());
        Assert.Equal("Solid game.", details.GetProperty("userContext").GetProperty("myReview").GetProperty("text").GetString());
        Assert.Equal(100, details.GetProperty("ratingSummary").GetProperty("recommendPercent").GetInt32());

        // Без отзывов доля не считается.
        var (_, emptySlug) = await SeedGameAsync();
        var empty = await Body(await _factory.CreateClient().GetAsync($"/api/games/{emptySlug}"));
        Assert.Equal(JsonValueKind.Null, empty.GetProperty("ratingSummary").GetProperty("recommendPercent").ValueKind);
    }

    /// <summary>У настоящего токена Identity.Name — отображаемое имя, а заказ записан по email:
    /// покупка должна находиться всё равно, иначе покупатель не видит форму отзыва.</summary>
    [Fact]
    public async Task Purchase_is_found_when_the_token_name_differs_from_the_order_email()
    {
        var (gameId, slug) = await SeedGameAsync();
        var buyer = $"buyer-{Guid.NewGuid():N}@taleshop.test";
        await SeedPaidOrderAsync(buyer, gameId);

        var client = As(buyer);
        client.DefaultRequestHeaders.Add(TestAuthHandler.NameHeader, "Andrey K.");

        var details = await Body(await client.GetAsync($"/api/games/{slug}"));
        Assert.True(details.GetProperty("userContext").GetProperty("hasPurchased").GetBoolean());

        var review = await client.PostAsJsonAsync($"/api/games/{gameId}/reviews", new { rating = 5, text = "Found my purchase." });
        Assert.Equal(HttpStatusCode.OK, review.StatusCode);
    }

    [Fact]
    public async Task Verdict_comes_from_the_stars_and_the_share_counts_only_four_and_five()
    {
        var (gameId, slug) = await SeedGameAsync();
        var buyers = new[] { 5, 3, 2 }.Select(rating => (email: $"buyer-{Guid.NewGuid():N}@taleshop.test", rating)).ToList();
        foreach (var (email, rating) in buyers)
        {
            await SeedPaidOrderAsync(email, gameId);
            // Клиентское recommend игнорируется: «2 звезды, рекомендую» больше невозможно.
            var created = await Body(await As(email).PostAsJsonAsync($"/api/games/{gameId}/reviews", new { rating, text = $"{rating} stars.", recommend = true }));
            Assert.Equal(rating, created.GetProperty("rating").GetInt32());
        }

        var list = await Body(await _factory.CreateClient().GetAsync($"/api/games/{gameId}/reviews?pageSize=10"));
        var byRating = list.GetProperty("items").EnumerateArray().ToDictionary(item => item.GetProperty("rating").GetInt32(), item => item.GetProperty("recommend"));
        Assert.True(byRating[5].GetBoolean());
        Assert.Equal(JsonValueKind.Null, byRating[3].ValueKind);
        Assert.False(byRating[2].GetBoolean());

        var details = await Body(await _factory.CreateClient().GetAsync($"/api/games/{slug}"));
        Assert.Equal(33, details.GetProperty("ratingSummary").GetProperty("recommendPercent").GetInt32());

        // Правка оценки меняет вердикт вместе с ней.
        var (email5, _) = buyers[0];
        var mine = list.GetProperty("items").EnumerateArray().First(item => item.GetProperty("rating").GetInt32() == 5).GetProperty("id").GetString();
        var updated = await Body(await As(email5).PutAsJsonAsync($"/api/reviews/{mine}", new { rating = 1, text = "Changed my mind." }));
        Assert.False(updated.GetProperty("recommend").GetBoolean());
        // Правка автора помечается отдельно от служебного UpdatedAt — витрина пишет «Edited …».
        Assert.NotEqual(JsonValueKind.Null, updated.GetProperty("editedAt").ValueKind);
    }
}
