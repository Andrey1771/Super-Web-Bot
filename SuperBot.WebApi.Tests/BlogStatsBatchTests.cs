using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Счётчик дочитываний считается теперь одной агрегацией на весь список статей вместо
/// выборки всех событий каждой статьи в память.
///
/// Тесты держат правила, которые при переносе в базу легче всего потерять: читатель
/// определяется по аккаунту, иначе по анонимному идентификатору, иначе по сессии; один
/// читатель считается один раз, сколько бы событий ни прислал; чужие типы событий и
/// события старше окна не в счёт.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class BlogStatsBatchTests
{
    private readonly TaleShopApiFactory _factory;

    public BlogStatsBatchTests(TaleShopApiFactory factory) => _factory = factory;

    private async Task<string> SeedPostAsync(string marker)
    {
        using var scope = _factory.Services.CreateScope();
        var blog = scope.ServiceProvider.GetRequiredService<IBlogRepository>();

        var slug = $"stats-probe-{marker}";
        await blog.CreateAsync(
            new BlogPost
            {
                Slug = slug,
                Title = "Stats probe",
                Excerpt = "probe",
                Status = "PUBLISHED",
                PublishedAt = DateTime.UtcNow.AddDays(-1),
                CreatedAt = DateTime.UtcNow.AddDays(-1),
                UpdatedAt = DateTime.UtcNow,
                Tags = new[] { "News" }
            },
            new BlogPostVersion { Title = "Stats probe", Excerpt = "probe", ContentMarkdown = "Body", CreatedAt = DateTime.UtcNow });

        return (await blog.GetBySlugAsync(slug))!.Id!;
    }

    private async Task TrackAsync(string postId, string eventType, string userId, string anonId, string sessionId, DateTime at)
    {
        using var scope = _factory.Services.CreateScope();
        var events = scope.ServiceProvider.GetRequiredService<IBlogEventRepository>();
        await events.CreateAsync(new BlogEvent
        {
            PostId = postId,
            EventType = eventType,
            UserId = userId,
            AnonId = anonId,
            SessionId = sessionId,
            Timestamp = at
        });
    }

    private async Task<Dictionary<string, int>> CountAsync(params string[] postIds)
    {
        using var scope = _factory.Services.CreateScope();
        var events = scope.ServiceProvider.GetRequiredService<IBlogEventRepository>();
        return await events.CountDistinctActorsByPostsAsync(postIds, "POST_READ_COMPLETE", DateTime.UtcNow.AddYears(-3));
    }

    [Fact]
    public async Task Counts_each_reader_once_per_post_and_ignores_everything_else()
    {
        var marker = Guid.NewGuid().ToString("N");
        var first = await SeedPostAsync(marker);
        var second = await SeedPostAsync($"{marker}-b");
        var now = DateTime.UtcNow;

        // Один и тот же аккаунт дочитал статью дважды — это один читатель.
        await TrackAsync(first, "POST_READ_COMPLETE", "reader@test.io", "anon-1", "session-1", now.AddHours(-2));
        await TrackAsync(first, "POST_READ_COMPLETE", "reader@test.io", "anon-2", "session-2", now.AddHours(-1));
        // Гость без аккаунта — считается по анонимному идентификатору.
        await TrackAsync(first, "POST_READ_COMPLETE", "", "anon-guest", "session-3", now.AddMinutes(-30));
        // Только сессия — тоже читатель, но отдельный.
        await TrackAsync(first, "POST_READ_COMPLETE", "", "", "session-only", now.AddMinutes(-20));
        // Ни одного идентификатора — считать некого.
        await TrackAsync(first, "POST_READ_COMPLETE", "", "", "", now.AddMinutes(-15));
        // Другое событие и слишком старое дочитывание в счёт не идут.
        await TrackAsync(first, "POST_REACTION_SET", "", "anon-reactor", "session-4", now.AddMinutes(-10));
        await TrackAsync(first, "POST_READ_COMPLETE", "", "anon-ancient", "session-5", now.AddYears(-4));
        // Соседняя статья считается своей строкой.
        await TrackAsync(second, "POST_READ_COMPLETE", "", "anon-guest", "session-6", now.AddMinutes(-5));

        var counts = await CountAsync(first, second);

        Assert.Equal(3, counts[first]);
        Assert.Equal(1, counts[second]);
    }

    [Fact]
    public async Task Posts_without_reads_are_simply_absent()
    {
        var quiet = await SeedPostAsync(Guid.NewGuid().ToString("N"));

        var counts = await CountAsync(quiet);

        Assert.False(counts.ContainsKey(quiet));
        Assert.Empty(await CountAsync());
    }
}
