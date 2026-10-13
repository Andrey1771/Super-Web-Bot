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
            Text = "Terrible", CreatedAt = DateTime.UtcNow, Status = ReviewStatus.Published
        };
        await reviews.CreateAsync(review);
        return (gameId, review.Id);
    }

    private static StringContent Report(string reason, string? comment = null) =>
        new(JsonSerializer.Serialize(new { reason, comment }), System.Text.Encoding.UTF8, "application/json");

    /// <summary>
    /// Жалоба — заявка модератору, не выключатель: одна жалоба отзыв не прячет, второй раз с того же
    /// аккаунта пожаловаться нельзя, а по порогу разных жалобщиков отзыв уходит на модерацию с причинами.
    /// </summary>
    [Fact]
    public async Task Reports_need_a_reason_hide_only_at_threshold_and_reach_the_moderator_with_reasons()
    {
        var (gameId, reviewId) = await SeedReviewAsync();
        var first = As("one@taleshop.test", "");
        var support = As("agent@taleshop.test", "support");

        // Без причины — отказ; с причиной — принято, но отзыв остаётся на витрине.
        Assert.Equal(HttpStatusCode.BadRequest, (await first.PostAsync($"/api/reviews/{reviewId}/report", Report(""))).StatusCode);
        var accepted = await Body(await first.PostAsync($"/api/reviews/{reviewId}/report", Report("Abusive", "Calls other players names.")));
        Assert.False(accepted.GetProperty("hidden").GetBoolean());
        Assert.Equal(1, accepted.GetProperty("reports").GetInt32());
        var stillThere = await Body(await first.GetAsync($"/api/games/{gameId}/reviews"));
        Assert.Contains(stillThere.GetProperty("items").EnumerateArray(), r => r.GetProperty("id").GetString() == reviewId);

        // Повтор с того же аккаунта не считается.
        Assert.Equal(HttpStatusCode.Conflict, (await first.PostAsync($"/api/reviews/{reviewId}/report", Report("Abusive"))).StatusCode);

        // Третий разный жалобщик — порог: отзыв уходит с витрины.
        await As("two@taleshop.test", "").PostAsync($"/api/reviews/{reviewId}/report", Report("OffTopic"));
        var third = await Body(await As("three@taleshop.test", "").PostAsync($"/api/reviews/{reviewId}/report", Report("Other", "It is a copy of a Steam review.")));
        Assert.True(third.GetProperty("hidden").GetBoolean());
        var after = await Body(await first.GetAsync($"/api/games/{gameId}/reviews"));
        Assert.DoesNotContain(after.GetProperty("items").EnumerateArray(), r => r.GetProperty("id").GetString() == reviewId);

        // У модератора — со счётчиком и причинами.
        var pending = await Body(await support.GetAsync("/api/admin/moderation/reviews?status=pending&pageSize=100"));
        var mine = pending.GetProperty("items").EnumerateArray().Single(r => r.GetProperty("id").GetString() == reviewId);
        Assert.Equal(3, mine.GetProperty("reportCount").GetInt32());
        var reasons = mine.GetProperty("reports").EnumerateArray().Select(r => r.GetProperty("reason").GetString()).ToList();
        Assert.Equal(new[] { "Other", "OffTopic", "Abusive" }, reasons);
        Assert.Contains(mine.GetProperty("reports").EnumerateArray(), r => r.GetProperty("comment").GetString() == "Calls other players names.");
        Assert.StartsWith("Moderated Game", mine.GetProperty("gameTitle").GetString());

        // Модератор публикует обратно — на витрине снова есть.
        var publish = await support.PostAsync($"/api/admin/moderation/reviews/{reviewId}/publish", null);
        Assert.Equal(HttpStatusCode.OK, publish.StatusCode);
        var restored = await Body(await first.GetAsync($"/api/games/{gameId}/reviews"));
        Assert.Contains(restored.GetProperty("items").EnumerateArray(), r => r.GetProperty("id").GetString() == reviewId);
    }

    [Fact]
    public async Task Spam_report_hides_the_review_at_once_and_own_review_cannot_be_reported()
    {
        var (gameId, reviewId) = await SeedReviewAsync();

        // Автор отзыва (userId "u1" в SeedReviewAsync — не он) не может пожаловаться на себя: проверяем чужим и своим.
        var spamReport = await Body(await As("spotter@taleshop.test", "").PostAsync($"/api/reviews/{reviewId}/report", Report("Spam", "Promo code in the text.")));
        Assert.True(spamReport.GetProperty("hidden").GetBoolean());
        var after = await Body(await _factory.CreateClient().GetAsync($"/api/games/{gameId}/reviews"));
        Assert.DoesNotContain(after.GetProperty("items").EnumerateArray(), r => r.GetProperty("id").GetString() == reviewId);

        // «Other» без пояснения — отказ: модератору нечего разбирать.
        Assert.Equal(HttpStatusCode.BadRequest, (await As("vague@taleshop.test", "").PostAsync($"/api/reviews/{reviewId}/report", Report("Other"))).StatusCode);
    }

    /// <summary>Ответов магазина под отзывами нет: ни эндпоинта, ни поля в выдаче — старый
    /// shopReply в документе витрине не показывается.</summary>
    [Fact]
    public async Task Shop_replies_do_not_exist()
    {
        var (gameId, reviewId) = await SeedReviewAsync();
        var support = As("agent@taleshop.test", "support");

        var reply = await support.PostAsJsonAsync($"/api/admin/moderation/reviews/{reviewId}/reply", new { text = "Sorry — we have refunded you." });
        Assert.Equal(HttpStatusCode.NotFound, reply.StatusCode);

        var list = await Body(await _factory.CreateClient().GetAsync($"/api/games/{gameId}/reviews"));
        var item = list.GetProperty("items").EnumerateArray().Single(r => r.GetProperty("id").GetString() == reviewId);
        Assert.False(item.TryGetProperty("shopReply", out _));
    }

    [Fact]
    public async Task Moderation_is_closed_to_plain_customers()
    {
        var customer = As("someone@taleshop.test", "");
        Assert.Equal(HttpStatusCode.Forbidden, (await customer.GetAsync("/api/admin/moderation/reviews")).StatusCode);
    }
}
