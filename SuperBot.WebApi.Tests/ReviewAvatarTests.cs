using System.Net;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Аватар автора отзыва.
///
/// Главное, что здесь сторожится: аватар берётся из профиля в момент показа, а не хранится
/// в отзыве. Отсюда всё остальное — смена аватара видна в старых отзывах, снятие убирает его
/// отовсюду разом, а модератор снимает картинку, не трогая текст.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class ReviewAvatarTests
{
    private readonly TaleShopApiFactory _factory;

    public ReviewAvatarTests(TaleShopApiFactory factory) => _factory = factory;

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

    private static async Task<JsonElement> Body(HttpResponseMessage r) =>
        JsonSerializer.Deserialize<JsonElement>(await r.Content.ReadAsStringAsync());

    private async Task<(string gameId, string reviewId, string userId)> SeedReviewAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var reviews = scope.ServiceProvider.GetRequiredService<IGameReviewRepository>();
        var gameId = ObjectId.GenerateNewId().ToString();
        var userId = $"avatar-{Guid.NewGuid():N}";
        var title = $"Avatar Game {Guid.NewGuid():N}"[..24];
        await games.CreateAsync(new Game { Id = gameId, Name = title, Title = title, Price = 5m, Currency = "USD" });
        var review = new GameReview
        {
            Id = ObjectId.GenerateNewId().ToString(),
            GameId = gameId,
            UserId = userId,
            UserName = "Sam Rivera",
            Rating = 5,
            Text = "Great",
            CreatedAt = DateTime.UtcNow,
            Status = ReviewStatus.Published
        };
        await reviews.CreateAsync(review);
        return (gameId, review.Id, userId);
    }

    /// <summary>Профиль с аватаром: путь и метка времени — ровно то, из чего собирается адрес.</summary>
    private async Task SetProfileAvatarAsync(string userId, string? path, DateTime? updatedAt)
    {
        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<IMongoDatabase>().GetCollection<UserDb>("Users");
        await users.UpdateOneAsync(
            u => u.UserId == userId,
            Builders<UserDb>.Update
                .Set(u => u.AvatarPath, path)
                .Set(u => u.AvatarUpdatedAt, updatedAt)
                .SetOnInsert(u => u.UserId, userId)
                .SetOnInsert(u => u.Name, "Sam Rivera")
                .SetOnInsert(u => u.Username, "Sam Rivera")
                .SetOnInsert(u => u.CreatedAt, DateTime.UtcNow),
            new UpdateOptions { IsUpsert = true });
    }

    private async Task<string?> StorefrontAvatarAsync(string gameId, string reviewId)
    {
        var body = await Body(await _factory.CreateClient().GetAsync($"/api/games/{gameId}/reviews"));
        var review = body.GetProperty("items").EnumerateArray()
            .Single(r => r.GetProperty("id").GetString() == reviewId);
        return review.GetProperty("avatarUrl").GetString();
    }

    [Fact]
    public async Task Author_without_a_profile_photo_has_no_avatar()
    {
        var (gameId, reviewId, _) = await SeedReviewAsync();

        Assert.Null(await StorefrontAvatarAsync(gameId, reviewId));
    }

    [Fact]
    public async Task The_photo_comes_from_the_profile_with_a_cache_busting_stamp()
    {
        var (gameId, reviewId, userId) = await SeedReviewAsync();
        var stamp = new DateTime(2026, 9, 11, 10, 0, 0, DateTimeKind.Utc);
        await SetProfileAvatarAsync(userId, "avatars/sam/avatar.webp", stamp);

        var url = await StorefrontAvatarAsync(gameId, reviewId);

        Assert.Equal($"/uploads/avatars/sam/avatar.webp?v={stamp.Ticks}", url);
    }

    /// <summary>
    /// То, ради чего аватар не кладут в отзыв: человек сменил картинку — старые отзывы
    /// показывают новую. Снимок заморозил бы и её, и метку версии.
    /// </summary>
    [Fact]
    public async Task Changing_the_photo_updates_reviews_written_long_ago()
    {
        var (gameId, reviewId, userId) = await SeedReviewAsync();
        await SetProfileAvatarAsync(userId, "avatars/sam/avatar.webp", new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        var before = await StorefrontAvatarAsync(gameId, reviewId);

        await SetProfileAvatarAsync(userId, "avatars/sam/avatar.webp", new DateTime(2026, 9, 11, 0, 0, 0, DateTimeKind.Utc));
        var after = await StorefrontAvatarAsync(gameId, reviewId);

        Assert.NotNull(before);
        Assert.NotEqual(before, after);
    }

    [Fact]
    public async Task Removing_the_photo_leaves_no_dead_link_behind()
    {
        var (gameId, reviewId, userId) = await SeedReviewAsync();
        await SetProfileAvatarAsync(userId, "avatars/sam/avatar.webp", DateTime.UtcNow);
        Assert.NotNull(await StorefrontAvatarAsync(gameId, reviewId));

        await SetProfileAvatarAsync(userId, null, null);

        Assert.Null(await StorefrontAvatarAsync(gameId, reviewId));
    }

    [Fact]
    public async Task The_moderation_queue_shows_the_photo_it_is_asked_about()
    {
        var (_, reviewId, userId) = await SeedReviewAsync();
        await SetProfileAvatarAsync(userId, "avatars/sam/avatar.webp", DateTime.UtcNow);

        var support = As("agent@taleshop.test", "support");
        var queue = await Body(await support.GetAsync("/api/admin/moderation/reviews?status=all&pageSize=100"));
        var mine = queue.GetProperty("items").EnumerateArray().Single(r => r.GetProperty("id").GetString() == reviewId);

        Assert.StartsWith("/uploads/avatars/sam/avatar.webp?v=", mine.GetProperty("avatarUrl").GetString());
    }

    /// <summary>
    /// Снятие картинки и решение по тексту — разные действия: текст бывает нормальным при
    /// непристойной картинке и наоборот.
    /// </summary>
    [Fact]
    public async Task Moderator_removes_the_photo_without_touching_the_review()
    {
        var (gameId, reviewId, userId) = await SeedReviewAsync();
        await SetProfileAvatarAsync(userId, "avatars/sam/avatar.webp", DateTime.UtcNow);

        var support = As("agent@taleshop.test", "support");
        var response = await support.PostAsync($"/api/admin/moderation/reviews/{reviewId}/remove-avatar", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True((await Body(response)).GetProperty("removed").GetBoolean());

        // Картинки нет нигде, а отзыв как был опубликован, так и остался.
        Assert.Null(await StorefrontAvatarAsync(gameId, reviewId));
        var storefront = await Body(await _factory.CreateClient().GetAsync($"/api/games/{gameId}/reviews"));
        var review = storefront.GetProperty("items").EnumerateArray()
            .Single(r => r.GetProperty("id").GetString() == reviewId);
        Assert.Equal("Great", review.GetProperty("text").GetString());
    }

    [Fact]
    public async Task Removing_a_photo_that_is_not_there_is_not_an_error()
    {
        var (_, reviewId, _) = await SeedReviewAsync();
        var support = As("agent@taleshop.test", "support");

        var response = await support.PostAsync($"/api/admin/moderation/reviews/{reviewId}/remove-avatar", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False((await Body(response)).GetProperty("removed").GetBoolean());
    }

    [Fact]
    public async Task Only_staff_can_remove_someone_elses_photo()
    {
        var (_, reviewId, userId) = await SeedReviewAsync();
        await SetProfileAvatarAsync(userId, "avatars/sam/avatar.webp", DateTime.UtcNow);

        var customer = As("buyer@taleshop.test", "");
        var response = await customer.PostAsync($"/api/admin/moderation/reviews/{reviewId}/remove-avatar", null);

        Assert.True(
            response.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.Unauthorized,
            $"покупатель не должен снимать чужие аватары, а получил {response.StatusCode}");
    }
}
