using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Controllers;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Комментарии под статьями новостей.
///
/// Правила: пишут только залогиненные, подпись — ник из профиля (почта в открытую
/// ленту не утекает), «простыни» и флуд режутся на API, скрытое модератором
/// исчезает у публики, но остаётся в админке.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class BlogCommentsTests
{
    private readonly TaleShopApiFactory _factory;

    public BlogCommentsTests(TaleShopApiFactory factory) => _factory = factory;

    private async Task<string> SeedPostAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var blog = scope.ServiceProvider.GetRequiredService<IBlogRepository>();

        var slug = $"comments-probe-{Guid.NewGuid():N}";
        var post = new BlogPost
        {
            Slug = slug,
            Title = "Comments probe",
            Excerpt = "probe",
            Status = "PUBLISHED",
            PublishedAt = DateTime.UtcNow.AddDays(-1),
            CreatedAt = DateTime.UtcNow.AddDays(-1),
            UpdatedAt = DateTime.UtcNow,
            Tags = new[] { "News" }
        };
        var version = new BlogPostVersion
        {
            Title = post.Title,
            Excerpt = post.Excerpt,
            ContentMarkdown = "Body",
            CreatedAt = DateTime.UtcNow
        };

        await blog.CreateAsync(post, version);
        return (await blog.GetBySlugAsync(slug)).Id!;
    }

    /// <summary>Залогиненный покупатель. Email уникален на вызов, чтобы rate-limit
    /// одного теста не задевал соседние.</summary>
    private HttpClient CreateUserClient(string? email = null)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, email ?? $"reader-{Guid.NewGuid():N}@taleshop.test");
        return client;
    }

    private HttpClient CreateAdminClient()
    {
        var client = CreateUserClient("moderator@taleshop.test");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        return client;
    }

    private static async Task<JsonElement> ReadJsonAsync(HttpResponseMessage response)
    {
        return JsonSerializer.Deserialize<JsonElement>(await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Anonymous_visitor_cannot_comment()
    {
        var postId = await SeedPostAsync();
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/blog/comments", new
        {
            postId,
            text = "drive-by comment"
        });

        Assert.True(
            response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden,
            $"Expected 401/403, got {(int)response.StatusCode}");
    }

    [Fact]
    public async Task Posted_comment_comes_back_signed_with_the_profile_nick()
    {
        var postId = await SeedPostAsync();
        var client = CreateUserClient("alex-the-gamer@taleshop.test");

        var create = await client.PostAsJsonAsync("/api/blog/comments", new
        {
            postId,
            text = "Great deal, thanks!"
        });
        create.EnsureSuccessStatusCode();

        var list = await ReadJsonAsync(await client.GetAsync($"/api/blog/comments?postId={postId}"));

        Assert.Equal(1, list.GetProperty("total").GetInt32());
        var item = list.GetProperty("items").EnumerateArray().Single();
        // Подпись — ник, не почта: домен отрезан, «@» в публичной ленте нет.
        Assert.Equal("alex-the-gamer", item.GetProperty("authorName").GetString());
        Assert.DoesNotContain("@", item.GetProperty("authorName").GetString());
        Assert.Equal("Great deal, thanks!", item.GetProperty("text").GetString());
    }

    [Fact]
    public async Task List_does_not_leak_private_fields()
    {
        var postId = await SeedPostAsync();
        var client = CreateUserClient();

        await client.PostAsJsonAsync("/api/blog/comments", new { postId, anonId = "secret-anon", text = "hi" });

        var list = await ReadJsonAsync(await client.GetAsync($"/api/blog/comments?postId={postId}"));
        var item = list.GetProperty("items").EnumerateArray().Single();

        Assert.False(item.TryGetProperty("anonId", out _));
        Assert.False(item.TryGetProperty("userId", out _));
    }

    [Fact]
    public async Task Newest_comment_comes_first_and_paging_works()
    {
        var postId = await SeedPostAsync();
        var client = CreateUserClient();

        for (var i = 1; i <= 3; i++)
        {
            var response = await client.PostAsJsonAsync("/api/blog/comments", new { postId, text = $"comment {i}" });
            response.EnsureSuccessStatusCode();
            // CreatedAt проставляется сервером; пауза гарантирует разные метки времени.
            await Task.Delay(15);
        }

        var page1 = await ReadJsonAsync(await client.GetAsync($"/api/blog/comments?postId={postId}&page=1&pageSize=2"));
        Assert.Equal(3, page1.GetProperty("total").GetInt32());
        var page1Texts = page1.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("text").GetString()).ToList();
        Assert.Equal(new[] { "comment 3", "comment 2" }, page1Texts);

        var page2 = await ReadJsonAsync(await client.GetAsync($"/api/blog/comments?postId={postId}&page=2&pageSize=2"));
        var page2Texts = page2.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("text").GetString()).ToList();
        Assert.Equal(new[] { "comment 1" }, page2Texts);
    }

    [Fact]
    public async Task Empty_text_is_rejected()
    {
        var postId = await SeedPostAsync();
        var response = await CreateUserClient().PostAsJsonAsync("/api/blog/comments", new { postId, text = "   " });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Overlong_text_is_rejected()
    {
        var postId = await SeedPostAsync();
        var response = await CreateUserClient().PostAsJsonAsync("/api/blog/comments", new
        {
            postId,
            text = new string('x', BlogCommentsController.MaxTextLength + 1)
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Unknown_post_gives_404()
    {
        var response = await CreateUserClient().PostAsJsonAsync("/api/blog/comments", new
        {
            postId = "64b000000000000000000000",
            text = "hello"
        });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Sixth_comment_in_the_window_hits_the_rate_limit()
    {
        var postId = await SeedPostAsync();
        var client = CreateUserClient();

        for (var i = 0; i < BlogCommentsController.RateLimitMaxComments; i++)
        {
            var ok = await client.PostAsJsonAsync("/api/blog/comments", new { postId, text = $"burst {i}" });
            ok.EnsureSuccessStatusCode();
        }

        var throttled = await client.PostAsJsonAsync("/api/blog/comments", new { postId, text = "one too many" });

        Assert.Equal(HttpStatusCode.TooManyRequests, throttled.StatusCode);
    }

    [Fact]
    public async Task Hidden_comment_disappears_from_the_public_list_but_stays_for_admin()
    {
        var postId = await SeedPostAsync();
        var client = CreateUserClient();

        var create = await client.PostAsJsonAsync("/api/blog/comments", new { postId, text = "spammy nonsense" });
        create.EnsureSuccessStatusCode();
        var commentId = (await ReadJsonAsync(create)).GetProperty("id").GetString();

        var admin = CreateAdminClient();
        var hide = await admin.PostAsJsonAsync($"/api/admin/blog/comments/{commentId}/status", new { status = "Hidden" });
        hide.EnsureSuccessStatusCode();

        // Публика скрытого не видит — ни в ленте, ни в счётчике.
        var publicList = await ReadJsonAsync(await client.GetAsync($"/api/blog/comments?postId={postId}"));
        Assert.Equal(0, publicList.GetProperty("total").GetInt32());
        Assert.Empty(publicList.GetProperty("items").EnumerateArray());

        // Админ видит со статусом и названием поста.
        var adminList = await ReadJsonAsync(await admin.GetAsync("/api/admin/blog/comments?status=Hidden&pageSize=50"));
        var hidden = adminList.GetProperty("items").EnumerateArray()
            .Single(item => item.GetProperty("id").GetString() == commentId);
        Assert.Equal("Hidden", hidden.GetProperty("status").GetString());
        Assert.Equal("Comments probe", hidden.GetProperty("postTitle").GetString());

        // Возврат в Visible возвращает комментарий публике.
        var show = await admin.PostAsJsonAsync($"/api/admin/blog/comments/{commentId}/status", new { status = "Visible" });
        show.EnsureSuccessStatusCode();
        var restored = await ReadJsonAsync(await client.GetAsync($"/api/blog/comments?postId={postId}"));
        Assert.Equal(1, restored.GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Admin_can_delete_a_comment_for_good()
    {
        var postId = await SeedPostAsync();
        var client = CreateUserClient();

        var create = await client.PostAsJsonAsync("/api/blog/comments", new { postId, text = "delete me" });
        var commentId = (await ReadJsonAsync(create)).GetProperty("id").GetString();

        var admin = CreateAdminClient();
        var delete = await admin.DeleteAsync($"/api/admin/blog/comments/{commentId}");
        delete.EnsureSuccessStatusCode();

        var publicList = await ReadJsonAsync(await client.GetAsync($"/api/blog/comments?postId={postId}"));
        Assert.Equal(0, publicList.GetProperty("total").GetInt32());

        var repeat = await admin.DeleteAsync($"/api/admin/blog/comments/{commentId}");
        Assert.Equal(HttpStatusCode.NotFound, repeat.StatusCode);
    }

    [Fact]
    public async Task Banned_author_cannot_comment_until_unbanned()
    {
        var postId = await SeedPostAsync();
        var client = CreateUserClient("troublemaker@taleshop.test");

        var create = await client.PostAsJsonAsync("/api/blog/comments", new { postId, text = "first strike" });
        create.EnsureSuccessStatusCode();
        var commentId = (await ReadJsonAsync(create)).GetProperty("id").GetString();

        var admin = CreateAdminClient();
        var ban = await admin.PostAsJsonAsync($"/api/admin/blog/comments/{commentId}/ban-author", new { });
        ban.EnsureSuccessStatusCode();

        // Забаненный получает 403, а не 400/429 — причина именно в бане.
        var blocked = await client.PostAsJsonAsync("/api/blog/comments", new { postId, text = "second try" });
        Assert.Equal(HttpStatusCode.Forbidden, blocked.StatusCode);

        // Флаг бана виден в админ-списке.
        var adminList = await ReadJsonAsync(await admin.GetAsync("/api/admin/blog/comments?pageSize=100"));
        var row = adminList.GetProperty("items").EnumerateArray()
            .Single(item => item.GetProperty("id").GetString() == commentId);
        Assert.True(row.GetProperty("authorBanned").GetBoolean());

        // Разбан возвращает право голоса.
        var unban = await admin.PostAsJsonAsync($"/api/admin/blog/comments/{commentId}/unban-author", new { });
        unban.EnsureSuccessStatusCode();
        var allowedAgain = await client.PostAsJsonAsync("/api/blog/comments", new { postId, text = "reformed" });
        allowedAgain.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Moderation_endpoints_are_closed_to_non_admins()
    {
        var anonymous = _factory.CreateClient();
        var response = await anonymous.GetAsync("/api/admin/blog/comments");
        Assert.True(
            response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden,
            $"Expected 401/403, got {(int)response.StatusCode}");
    }
}
