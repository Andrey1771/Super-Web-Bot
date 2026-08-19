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
/// Модерация отзывов и вопросов. Сторожим сквозной путь: клиент пожаловался → отзыв исчез
/// с витрины и появился у модератора → модератор решил → витрина отражает решение. И для
/// вопросов: официальный ответ помечен как официальный там, где его увидит покупатель.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class AdminModerationTests
{
    private readonly TaleShopApiFactory _factory;

    public AdminModerationTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient As(string email, string roles)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, email);
        if (!string.IsNullOrEmpty(roles))
        {
            client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, roles);
        }
        return client;
    }

    private static async Task<JsonElement> Body(HttpResponseMessage r) => JsonSerializer.Deserialize<JsonElement>(await r.Content.ReadAsStringAsync());

    private async Task<(string gameId, string reviewId)> SeedReviewAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var reviews = scope.ServiceProvider.GetRequiredService<IGameReviewRepository>();
        var gameId = ObjectId.GenerateNewId().ToString();
        var title = $"Moderated Game {Guid.NewGuid():N}"[..26];
        await games.CreateAsync(new Game { Id = gameId, Name = title, Title = title, Price = 5m, Currency = "USD" });
        var review = new GameReview
        {
            Id = ObjectId.GenerateNewId().ToString(), GameId = gameId, UserId = "u1", UserName = "Reviewer", Rating = 1,
            Text = "Terrible", Recommend = false, CreatedAt = DateTime.UtcNow, Status = ReviewStatus.Published
        };
        await reviews.CreateAsync(review);
        return (gameId, review.Id);
    }

    [Fact]
    public async Task Reported_review_disappears_from_storefront_and_shows_up_for_moderation()
    {
        var (gameId, reviewId) = await SeedReviewAsync();
        var customer = As("angry@taleshop.test", "");
        var support = As("agent@taleshop.test", "support");

        // До жалобы — на витрине.
        var before = await Body(await customer.GetAsync($"/api/games/{gameId}/reviews"));
        Assert.Contains(before.GetProperty("items").EnumerateArray(), r => r.GetProperty("id").GetString() == reviewId);

        Assert.Equal(HttpStatusCode.OK, (await customer.PostAsync($"/api/reviews/{reviewId}/report", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await customer.PostAsync($"/api/reviews/{reviewId}/report", null)).StatusCode);

        // После — с витрины ушёл, у модератора появился со счётчиком жалоб.
        var after = await Body(await customer.GetAsync($"/api/games/{gameId}/reviews"));
        Assert.DoesNotContain(after.GetProperty("items").EnumerateArray(), r => r.GetProperty("id").GetString() == reviewId);

        var pending = await Body(await support.GetAsync("/api/admin/moderation/reviews?status=pending&pageSize=100"));
        var mine = pending.GetProperty("items").EnumerateArray().Single(r => r.GetProperty("id").GetString() == reviewId);
        Assert.Equal(2, mine.GetProperty("reportCount").GetInt32());
        Assert.StartsWith("Moderated Game", mine.GetProperty("gameTitle").GetString());

        // Модератор публикует обратно — на витрине снова есть.
        var publish = await support.PostAsync($"/api/admin/moderation/reviews/{reviewId}/publish", null);
        Assert.Equal(HttpStatusCode.OK, publish.StatusCode);
        var restored = await Body(await customer.GetAsync($"/api/games/{gameId}/reviews"));
        Assert.Contains(restored.GetProperty("items").EnumerateArray(), r => r.GetProperty("id").GetString() == reviewId);
    }

    [Fact]
    public async Task Shop_reply_is_visible_on_the_storefront()
    {
        var (gameId, reviewId) = await SeedReviewAsync();
        var support = As("agent@taleshop.test", "support");

        var reply = await support.PostAsJsonAsync($"/api/admin/moderation/reviews/{reviewId}/reply", new { text = "Sorry — we have refunded you." });
        Assert.Equal(HttpStatusCode.OK, reply.StatusCode);

        var list = await Body(await _factory.CreateClient().GetAsync($"/api/games/{gameId}/reviews"));
        var item = list.GetProperty("items").EnumerateArray().Single(r => r.GetProperty("id").GetString() == reviewId);
        Assert.Equal("Sorry — we have refunded you.", item.GetProperty("shopReply").GetProperty("text").GetString());
        Assert.Equal("agent@taleshop.test", item.GetProperty("shopReply").GetProperty("author").GetString());
    }

    [Fact]
    public async Task Official_answer_is_flagged_where_the_customer_sees_it()
    {
        string gameId;
        string questionId;
        using (var scope = _factory.Services.CreateScope())
        {
            var questions = scope.ServiceProvider.GetRequiredService<IGameQuestionRepository>();
            gameId = ObjectId.GenerateNewId().ToString();
            questionId = ObjectId.GenerateNewId().ToString();
            await questions.AddQuestionAsync(new GameQuestion { Id = questionId, GameId = gameId, UserId = "u2", UserName = "Curious", Question = "Is it region-locked?", CreatedAt = DateTime.UtcNow });
        }
        var support = As("agent@taleshop.test", "support");

        var unanswered = await Body(await support.GetAsync("/api/admin/moderation/questions?filter=unanswered&pageSize=100"));
        Assert.Contains(unanswered.GetProperty("items").EnumerateArray(), q => q.GetProperty("id").GetString() == questionId);

        Assert.Equal(HttpStatusCode.OK, (await support.PostAsJsonAsync($"/api/admin/moderation/questions/{questionId}/answer", new { text = "No, global key." })).StatusCode);

        // Ушёл из неотвеченных.
        var still = await Body(await support.GetAsync("/api/admin/moderation/questions?filter=unanswered&pageSize=100"));
        Assert.DoesNotContain(still.GetProperty("items").EnumerateArray(), q => q.GetProperty("id").GetString() == questionId);

        // На витрине ответ помечен официальным.
        var storefront = (await Body(await _factory.CreateClient().GetAsync($"/api/games/{gameId}/questions"))).GetProperty("items");
        var question = storefront.EnumerateArray().Single(q => q.GetProperty("id").GetString() == questionId);
        var answer = Assert.Single(question.GetProperty("answers").EnumerateArray());
        Assert.True(answer.GetProperty("isOfficial").GetBoolean());
        Assert.Equal("Tale Shop", answer.GetProperty("userName").GetString());
    }

    [Fact]
    public async Task Moderation_is_closed_to_plain_customers()
    {
        var customer = As("someone@taleshop.test", "");
        Assert.Equal(HttpStatusCode.Forbidden, (await customer.GetAsync("/api/admin/moderation/reviews")).StatusCode);
    }
}
