using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Отметка «статья дочитана» принимается в том виде, в каком её шлёт страница поста: anonId и ключ
/// сессии, без userId. Раньше модель требовала userId, и каждый такой запрос получал 400.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class BlogReadTrackingTests
{
    private readonly TaleShopApiFactory _factory;

    public BlogReadTrackingTests(TaleShopApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Completed_read_from_a_guest_is_counted_once()
    {
        var slug = $"read-probe-{Guid.NewGuid():N}";
        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<IBlogRepository>().CreateAsync(
                new BlogPost
                {
                    Slug = slug,
                    Title = "Read probe",
                    Excerpt = "probe",
                    Status = "PUBLISHED",
                    PublishedAt = DateTime.UtcNow.AddDays(-1),
                    CreatedAt = DateTime.UtcNow.AddDays(-1),
                    UpdatedAt = DateTime.UtcNow,
                    Tags = new[] { "News" }
                },
                new BlogPostVersion { Title = "Read probe", Excerpt = "probe", ContentMarkdown = "Body", CreatedAt = DateTime.UtcNow });
        }

        var guest = _factory.CreateClient();
        var body = new { anonId = $"anon-{Guid.NewGuid():N}", sessionKey = "session-1" };

        var first = await guest.PostAsJsonAsync($"/api/blog/posts/{slug}/track-read", body);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(1, (await first.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("completedReadsCount").GetInt32());

        // Повтор того же читателя не удваивает счётчик.
        var again = await guest.PostAsJsonAsync($"/api/blog/posts/{slug}/track-read", body);
        Assert.Equal(1, (await again.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("completedReadsCount").GetInt32());

        // Без anonId и сессии гость не опознан — отказ с понятной причиной, а не падение.
        var anonymous = await guest.PostAsJsonAsync($"/api/blog/posts/{slug}/track-read", new { });
        Assert.Equal(HttpStatusCode.BadRequest, anonymous.StatusCode);
    }
}
