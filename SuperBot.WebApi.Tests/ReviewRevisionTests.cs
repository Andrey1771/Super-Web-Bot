using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Правка отзыва автором оставляет прошлую версию модератору: с пометкой, была ли правка уже
/// под жалобами. Читатель истории не видит, как и служебных полей (email покупателя).
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class ReviewRevisionTests
{
    private readonly TaleShopApiFactory _factory;

    public ReviewRevisionTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient As(string email, string roles = "", string? sub = null)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, email);
        if (sub is not null)
        {
            client.DefaultRequestHeaders.Add(TestAuthHandler.SubHeader, sub);
        }
        if (roles.Length > 0)
        {
            client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, roles);
        }
        return client;
    }

    private static async Task<JsonElement> Body(HttpResponseMessage r) => JsonSerializer.Deserialize<JsonElement>(await r.Content.ReadAsStringAsync());

    private static StringContent Report(string reason) =>
        new(JsonSerializer.Serialize(new { reason }), Encoding.UTF8, "application/json");

    /// <summary>Отзыв автора: sub — как у Keycloak, непохожий на email; автор правит его, входя с тем же sub.</summary>
    private async Task<(string gameId, string reviewId)> SeedReviewAsync(string author, string sub)
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var reviews = scope.ServiceProvider.GetRequiredService<IGameReviewRepository>();
        var gameId = ObjectId.GenerateNewId().ToString();
        var title = $"Revised Game {Guid.NewGuid():N}"[..24];
        await games.CreateAsync(new Game { Id = gameId, Name = title, Title = title, Price = 5m, Currency = "USD" });
        var review = new GameReview
        {
            Id = ObjectId.GenerateNewId().ToString(), GameId = gameId, UserId = sub, UserName = "Author", Rating = 1,
            Text = "You are all idiots.", BuyerKey = author, CreatedAt = DateTime.UtcNow, Status = ReviewStatus.Published
        };
        await reviews.CreateAsync(review);
        return (gameId, review.Id);
    }

    [Fact]
    public async Task Edit_keeps_the_previous_version_for_the_moderator_and_flags_edits_made_under_report()
    {
        var author = $"author-{Guid.NewGuid():N}@taleshop.test";
        var sub = Guid.NewGuid().ToString();
        var (gameId, reviewId) = await SeedReviewAsync(author, sub);

        // Первая правка — до жалоб.
        var first = await As(author, sub: sub).PutAsJsonAsync($"/api/reviews/{reviewId}", new { rating = 2, text = "Still bad, but calmer." });
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        // Жалоба, потом вторая правка — уже под жалобой.
        Assert.Equal(HttpStatusCode.OK, (await As($"r-{Guid.NewGuid():N}@taleshop.test").PostAsync($"/api/reviews/{reviewId}/report", Report("Abusive"))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await As(author, sub: sub).PutAsJsonAsync($"/api/reviews/{reviewId}", new { rating = 4, text = "Actually fine." })).StatusCode);

        // Повтор без изменений историю не растит.
        Assert.Equal(HttpStatusCode.OK, (await As(author, sub: sub).PutAsJsonAsync($"/api/reviews/{reviewId}", new { rating = 4, text = "Actually fine." })).StatusCode);

        var queue = await Body(await As("mod@taleshop.test", "support").GetAsync("/api/admin/moderation/reviews?status=all&pageSize=100"));
        var item = queue.GetProperty("items").EnumerateArray().Single(r => r.GetProperty("id").GetString() == reviewId);
        var revisions = item.GetProperty("revisions").EnumerateArray().ToList();
        Assert.Equal(2, revisions.Count);
        // Свежие первыми: версия, заменённая под жалобой, — первая и помечена.
        Assert.Equal("Still bad, but calmer.", revisions[0].GetProperty("text").GetString());
        Assert.True(revisions[0].GetProperty("underReport").GetBoolean());
        Assert.Equal("You are all idiots.", revisions[1].GetProperty("text").GetString());
        Assert.Equal(1, revisions[1].GetProperty("rating").GetInt32());
        Assert.False(revisions[1].GetProperty("underReport").GetBoolean());
        Assert.NotEqual(JsonValueKind.Null, item.GetProperty("editedAt").ValueKind);
    }

    [Fact]
    public async Task Storefront_shows_only_the_edit_date_and_never_the_history_or_the_buyer_email()
    {
        var author = $"author-{Guid.NewGuid():N}@taleshop.test";
        var sub = Guid.NewGuid().ToString();
        var (gameId, reviewId) = await SeedReviewAsync(author, sub);
        Assert.Equal(HttpStatusCode.OK, (await As(author, sub: sub).PutAsJsonAsync($"/api/reviews/{reviewId}", new { rating = 3, text = "Rewritten." })).StatusCode);

        var list = await Body(await _factory.CreateClient().GetAsync($"/api/games/{gameId}/reviews"));
        var item = list.GetProperty("items").EnumerateArray().Single(r => r.GetProperty("id").GetString() == reviewId);
        Assert.NotEqual(JsonValueKind.Null, item.GetProperty("editedAt").ValueKind);
        Assert.False(item.TryGetProperty("revisions", out _));
        Assert.False(item.TryGetProperty("buyerKey", out _));
        Assert.DoesNotContain(author, await (await _factory.CreateClient().GetAsync($"/api/games/{gameId}/reviews")).Content.ReadAsStringAsync());
    }
}
