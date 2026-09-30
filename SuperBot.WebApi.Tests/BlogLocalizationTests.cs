using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Пост блога на языке покупателя: заголовок, анонс, тело версии и подписи тегов подставляются из переводов,
/// введённых в админке; сами теги остаются английскими значениями фильтра, админка читает всё как есть.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class BlogLocalizationTests
{
    private readonly TaleShopApiFactory _factory;

    public BlogLocalizationTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient Admin()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "owner@taleshop.test");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        return client;
    }

    private HttpClient Buyer(string? language)
    {
        var client = _factory.CreateClient();
        if (language is not null)
        {
            client.DefaultRequestHeaders.Add("Accept-Language", language);
        }
        return client;
    }

    [Fact]
    public async Task Blog_post_texts_follow_the_buyer_language_and_stay_english_for_the_admin()
    {
        var admin = Admin();
        var slug = $"localized-post-{Guid.NewGuid():N}"[..28];
        string? postId = null;
        try
        {
            var created = await admin.PostAsJsonAsync("/api/admin/blog/posts", new
            {
                title = "Autumn sale guide",
                slug,
                excerpt = "Where the best deals hide.",
                contentMarkdown = "English **body**",
                contentHtml = "<p>English <strong>body</strong></p>",
                titleI18n = new Dictionary<string, string> { ["ru"] = "Гид по осенней распродаже", ["de"] = "ignored", ["pl"] = " " },
                excerptI18n = new Dictionary<string, string> { ["ru"] = "Где прячутся лучшие скидки." },
                contentMarkdownI18n = new Dictionary<string, string> { ["ru"] = "Русское **тело**" },
                contentHtmlI18n = new Dictionary<string, string> { ["ru"] = "<p>Русское <strong>тело</strong></p>", ["uk"] = "<p>Українське тіло</p>" },
                tags = new[] { "guides", "deals" },
                // Лишний третий перевод отбрасывается, пустой второй — английский тег.
                tagsI18n = new Dictionary<string, string[]> { ["ru"] = new[] { "гайды", "", "лишнее" } },
                status = "PUBLISHED",
                publishedAt = DateTime.UtcNow.AddMinutes(-5),
                authorName = "Editor"
            });
            var createdBody = await created.Content.ReadAsStringAsync();
            Assert.True(created.IsSuccessStatusCode, createdBody);
            postId = JsonDocument.Parse(createdBody).RootElement.GetProperty("id").GetString();

            // Русский покупатель: пост и тело версии на русском, теги — английские значения с подписями.
            var russian = await (await Buyer("ru").GetAsync($"/api/blog/posts/{slug}")).Content.ReadFromJsonAsync<JsonElement>();
            var post = russian.GetProperty("post");
            Assert.Equal("Гид по осенней распродаже", post.GetProperty("title").GetString());
            Assert.Equal("Где прячутся лучшие скидки.", post.GetProperty("excerpt").GetString());
            Assert.Equal(new[] { "guides", "deals" }, post.GetProperty("tags").EnumerateArray().Select(x => x.GetString()));
            Assert.Equal(new[] { "гайды", "deals" }, post.GetProperty("tagLabels").EnumerateArray().Select(x => x.GetString()));
            var version = russian.GetProperty("version");
            Assert.Equal("<p>Русское <strong>тело</strong></p>", version.GetProperty("contentHtml").GetString());
            Assert.Equal("Русское **тело**", version.GetProperty("contentMarkdown").GetString());
            Assert.False(version.TryGetProperty("contentHtmlI18n", out var leaked) && leaked.ValueKind == JsonValueKind.Object, "витрине словари переводов не нужны");

            // Украинский: переведён только html — markdown пустой, чтобы страница не смешала языки; заголовок английский.
            var ukrainian = await (await Buyer("uk").GetAsync($"/api/blog/posts/{slug}")).Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal("Autumn sale guide", ukrainian.GetProperty("post").GetProperty("title").GetString());
            Assert.Equal("<p>Українське тіло</p>", ukrainian.GetProperty("version").GetProperty("contentHtml").GetString());
            Assert.Equal("", ukrainian.GetProperty("version").GetProperty("contentMarkdown").GetString());

            // Без языка — английское целиком.
            var plain = await (await Buyer(null).GetAsync($"/api/blog/posts/{slug}")).Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal("Autumn sale guide", plain.GetProperty("post").GetProperty("title").GetString());
            Assert.Equal("English **body**", plain.GetProperty("version").GetProperty("contentMarkdown").GetString());

            // Список постов и лента главной — тоже на языке покупателя.
            var list = await (await Buyer("ru").GetAsync($"/api/blog/posts?search={Uri.EscapeDataString("Autumn sale guide")}&pageSize=50")).Content.ReadFromJsonAsync<JsonElement>();
            var item = Assert.Single(list.GetProperty("items").EnumerateArray().Where(x => x.GetProperty("slug").GetString() == slug));
            Assert.Equal("Гид по осенней распродаже", item.GetProperty("title").GetString());
            Assert.Equal(new[] { "гайды", "deals" }, item.GetProperty("tagLabels").EnumerateArray().Select(x => x.GetString()));

            var feedBody = await (await Buyer("ru").GetAsync("/api/blog/home-feed?limit=50")).Content.ReadAsStringAsync();
            var feed = JsonDocument.Parse(feedBody).RootElement;
            Assert.True(feed.TryGetProperty("latestPosts", out _), feedBody);
            var feedItems = new[] { "latestPosts", "popularThisWeek", "editorsPicks", "forYou" }
                .SelectMany(key => feed.GetProperty(key).EnumerateArray())
                .Concat(feed.TryGetProperty("heroPost", out var hero) && hero.ValueKind == JsonValueKind.Object ? new[] { hero } : Array.Empty<JsonElement>())
                .Where(x => x.GetProperty("slug").GetString() == slug)
                .ToList();
            Assert.NotEmpty(feedItems);
            Assert.All(feedItems, x => Assert.Equal("Гид по осенней распродаже", x.GetProperty("title").GetString()));

            // Админка читает пост как есть: английские поля и словари без мусора («de», пустые, лишние позиции).
            var adminRu = Admin();
            adminRu.DefaultRequestHeaders.Add("Accept-Language", "ru");
            var stored = await (await adminRu.GetAsync($"/api/admin/blog/posts/{postId}")).Content.ReadFromJsonAsync<JsonElement>();
            var storedPost = stored.GetProperty("post");
            Assert.Equal("Autumn sale guide", storedPost.GetProperty("title").GetString());
            Assert.Equal(new[] { "ru" }, storedPost.GetProperty("titleI18n").EnumerateObject().Select(p => p.Name));
            Assert.Equal(2, storedPost.GetProperty("tagsI18n").GetProperty("ru").GetArrayLength());
            Assert.Equal("English **body**", stored.GetProperty("version").GetProperty("contentMarkdown").GetString());
            Assert.Equal("Русское **тело**", stored.GetProperty("version").GetProperty("contentMarkdownI18n").GetProperty("ru").GetString());
        }
        finally
        {
            if (postId is not null)
            {
                using var scope = _factory.Services.CreateScope();
                var database = scope.ServiceProvider.GetRequiredService<IMongoDatabase>();
                await database.GetCollection<BsonDocument>("BlogPosts").DeleteOneAsync(Builders<BsonDocument>.Filter.Eq("_id", ObjectId.Parse(postId)));
                await database.GetCollection<BsonDocument>("BlogPostVersions").DeleteManyAsync(Builders<BsonDocument>.Filter.Eq("postId", postId));
            }
        }
    }
}
