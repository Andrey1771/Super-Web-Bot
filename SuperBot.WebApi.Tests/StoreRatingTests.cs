using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;
using SuperBot.WebApi.Controllers;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Рейтинг магазина на витрине каталога. Раньше здесь стояли выдуманные «4.8 из 8 536 отзывов»,
/// теперь цифры считаются по настоящим отзывам — поэтому проверяем в первую очередь то,
/// что число не соврёт: скрытые отзывы не учитываются, пустая база даёт честный ноль,
/// а новый отзыв виден сразу, а не через срок кэша.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class StoreRatingTests
{
    private readonly TaleShopApiFactory _factory;

    public StoreRatingTests(TaleShopApiFactory factory) => _factory = factory;

    // ---------- helpers ----------

    /// <summary>
    /// Сводка общая для всего магазина, поэтому каждый тест начинает с чистой коллекции:
    /// иначе отзывы соседнего теста сдвинули бы среднюю оценку.
    /// </summary>
    private async Task ResetReviewsAsync()
    {
        using var scope = _factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<IMongoDatabase>()
            .GetCollection<GameReviewDb>("GameReviews")
            .DeleteManyAsync(Builders<GameReviewDb>.Filter.Empty);

        scope.ServiceProvider.GetRequiredService<IMemoryCache>()
            .Remove(GameReviewsController.SiteSummaryCacheKey);
    }

    private async Task SeedReviewAsync(
        int rating,
        string text = "Solid pick, arrived instantly.",
        ReviewStatus status = ReviewStatus.Published,
        string? gameId = null,
        DateTime? createdAt = null)
    {
        using var scope = _factory.Services.CreateScope();
        var reviews = scope.ServiceProvider.GetRequiredService<IGameReviewRepository>();

        await reviews.CreateAsync(new GameReview
        {
            GameId = gameId ?? $"game-{Guid.NewGuid():N}",
            UserId = $"user-{Guid.NewGuid():N}",
            UserName = "Player One",
            Rating = rating,
            Text = text,
            Status = status,
            CreatedAt = createdAt ?? DateTime.UtcNow
        });
    }

    private async Task<string> SeedGameAsync(string title)
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();

        await games.CreateAsync(new Game
        {
            Name = title,
            Title = title,
            Slug = $"rating-probe-{Guid.NewGuid():N}",
            Price = 10m,
            ImagePath = "cover.png",
            ReleaseDate = DateTime.UtcNow.AddYears(-1)
        });

        var all = await games.GetAllAsync();
        return all.First(game => game.Title == title).Id!;
    }

    private async Task<JsonElement> GetSummaryAsync()
    {
        var response = await _factory.CreateClient().GetAsync("/api/reviews/summary");
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    // ---------- сама сводка ----------

    [Fact]
    public async Task Summary_is_zero_when_no_reviews_exist()
    {
        // Молодой магазин без отзывов — нормальное состояние, а не ошибка:
        // витрина по нулю рисует «отзывов пока нет».
        await ResetReviewsAsync();

        var summary = await GetSummaryAsync();

        Assert.Equal(0, summary.GetProperty("count").GetInt32());
        Assert.Equal(0, summary.GetProperty("average").GetDouble());
        Assert.Empty(summary.GetProperty("quotes").EnumerateArray());
    }

    [Fact]
    public async Task Summary_averages_published_ratings()
    {
        await ResetReviewsAsync();
        await SeedReviewAsync(5);
        await SeedReviewAsync(4);
        await SeedReviewAsync(3);

        var summary = await GetSummaryAsync();

        Assert.Equal(3, summary.GetProperty("count").GetInt32());
        Assert.Equal(4.0, summary.GetProperty("average").GetDouble(), precision: 3);
    }

    [Fact]
    public async Task Hidden_and_pending_reviews_stay_out_of_the_rating()
    {
        // Скрытый модератором отзыв не должен тянуть среднюю ни вверх, ни вниз —
        // иначе скрытие превратилось бы в способ накрутки.
        await ResetReviewsAsync();
        await SeedReviewAsync(5);
        await SeedReviewAsync(1, status: ReviewStatus.Hidden);
        await SeedReviewAsync(1, status: ReviewStatus.Pending);

        var summary = await GetSummaryAsync();

        Assert.Equal(1, summary.GetProperty("count").GetInt32());
        Assert.Equal(5.0, summary.GetProperty("average").GetDouble(), precision: 3);
    }

    [Fact]
    public async Task Distribution_counts_every_rating_separately()
    {
        await ResetReviewsAsync();
        await SeedReviewAsync(5);
        await SeedReviewAsync(5);
        await SeedReviewAsync(3);

        var distribution = (await GetSummaryAsync()).GetProperty("distribution");

        Assert.Equal(2, distribution.GetProperty("5").GetInt32());
        Assert.Equal(1, distribution.GetProperty("3").GetInt32());
        // Оценки, которых никто не ставил, в объекте отсутствуют — витрина считает их нулём.
        Assert.False(distribution.TryGetProperty("4", out _));
    }

    // ---------- цитаты ----------

    [Fact]
    public async Task Quote_names_the_game_it_was_written_about()
    {
        await ResetReviewsAsync();
        var title = $"Rating Probe {Guid.NewGuid():N}";
        var gameId = await SeedGameAsync(title);
        await SeedReviewAsync(5, gameId: gameId);

        var quote = (await GetSummaryAsync()).GetProperty("quotes").EnumerateArray().Single();

        Assert.Equal(title, quote.GetProperty("gameTitle").GetString());
        Assert.False(string.IsNullOrWhiteSpace(quote.GetProperty("gameSlug").GetString()));
    }

    [Fact]
    public async Task Rating_without_text_counts_but_is_not_quoted()
    {
        // Оценка без слов — полноценный голос в средней, но цитировать в ней нечего.
        await ResetReviewsAsync();
        await SeedReviewAsync(4, text: string.Empty);
        await SeedReviewAsync(5, text: "Key worked right away.");

        var summary = await GetSummaryAsync();
        var quote = summary.GetProperty("quotes").EnumerateArray().Single();

        Assert.Equal(2, summary.GetProperty("count").GetInt32());
        Assert.Equal("Key worked right away.", quote.GetProperty("text").GetString());
    }

    [Fact]
    public async Task Newest_reviews_are_quoted_first()
    {
        await ResetReviewsAsync();
        await SeedReviewAsync(5, text: "Oldest", createdAt: DateTime.UtcNow.AddDays(-10));
        await SeedReviewAsync(5, text: "Middle", createdAt: DateTime.UtcNow.AddDays(-5));
        await SeedReviewAsync(5, text: "Newest", createdAt: DateTime.UtcNow);

        var quotes = (await GetSummaryAsync()).GetProperty("quotes")
            .EnumerateArray()
            .Select(quote => quote.GetProperty("text").GetString())
            .ToList();

        Assert.Equal(new[] { "Newest", "Middle" }, quotes);
    }

    // ---------- кэш ----------

    [Fact]
    public async Task Summary_is_served_from_cache_between_requests()
    {
        // Сводка одинакова для всех посетителей, поэтому считается редко.
        // Отзыв, добавленный в обход контроллера, до сброса кэша виден быть не должен.
        await ResetReviewsAsync();
        await SeedReviewAsync(5);

        Assert.Equal(1, (await GetSummaryAsync()).GetProperty("count").GetInt32());

        await SeedReviewAsync(1);

        Assert.Equal(1, (await GetSummaryAsync()).GetProperty("count").GetInt32());
    }

    [Fact]
    public async Task Posting_a_review_updates_the_rating_immediately()
    {
        // Покупатель, оставивший отзыв, должен увидеть его в счётчике сразу,
        // а не через срок жизни кэша — поэтому запись сбрасывает сводку.
        await ResetReviewsAsync();
        await SeedReviewAsync(5);
        Assert.Equal(1, (await GetSummaryAsync()).GetProperty("count").GetInt32());

        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, $"buyer-{Guid.NewGuid():N}@taleshop.test");

        var posted = await client.PostAsJsonAsync(
            $"/api/games/{Guid.NewGuid():N}/reviews",
            new { rating = 3, text = "Fine, nothing special." });
        posted.EnsureSuccessStatusCode();

        var summary = await GetSummaryAsync();

        Assert.Equal(2, summary.GetProperty("count").GetInt32());
        Assert.Equal(4.0, summary.GetProperty("average").GetDouble(), precision: 3);
    }
}
