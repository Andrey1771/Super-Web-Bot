using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Controllers;
using SuperBot.WebApi.Services;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Данные карточки в сетке каталога: оценка и наличие ключей.
///
/// Наличие здесь не украшение. Раньше игру с пустым пулом можно было оплатить и остаться
/// ждать поставки — теперь витрина закрывает покупку, и цена ошибки высокая в обе стороны:
/// ложное «нет в наличии» отнимает продажу, ложное «в наличии» отнимает доверие.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class CatalogCardTests
{
    private readonly TaleShopApiFactory _factory;

    public CatalogCardTests(TaleShopApiFactory factory) => _factory = factory;

    // ---------- helpers ----------

    private async Task<string> SeedGameAsync(DateTime? releaseDate = null)
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();

        var name = $"Card Probe {Guid.NewGuid():N}";
        await games.CreateAsync(new Game
        {
            Name = name,
            Title = name,
            Slug = $"card-probe-{Guid.NewGuid():N}",
            Price = 20m,
            ImagePath = "cover.png",
            ReleaseDate = releaseDate ?? DateTime.UtcNow.AddYears(-1)
        });

        var all = await games.GetAllAsync();
        return all.First(game => game.Name == name).Id!;
    }

    private async Task SeedPoolKeysAsync(string gameId, int count, string keyType = "Steam Key")
    {
        using var scope = _factory.Services.CreateScope();
        var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();

        await keys.AddPoolKeysAsync(
            gameId,
            keyType,
            Enumerable.Range(0, count).Select(_ => $"CARD-{Guid.NewGuid():N}"));
    }

    private static string[] PlatformsOf(JsonElement card) =>
        card.GetProperty("platforms").EnumerateArray().Select(item => item.GetString()!).ToArray();

    private async Task SeedReviewAsync(string gameId, int rating, ReviewStatus status = ReviewStatus.Published)
    {
        using var scope = _factory.Services.CreateScope();
        var reviews = scope.ServiceProvider.GetRequiredService<IGameReviewRepository>();

        await reviews.CreateAsync(new GameReview
        {
            GameId = gameId,
            UserId = $"user-{Guid.NewGuid():N}",
            UserName = "Player",
            Rating = rating,
            Text = "Review body.",
            Status = status,
            CreatedAt = DateTime.UtcNow
        });
    }

    /// <summary>
    /// Карточка нужной игры из общей выдачи каталога.
    ///
    /// Каталог собирается один раз и кэшируется, поэтому игры, заведённые в обход админского
    /// API, сами по себе на витрине не появятся — как и в бою после прямой правки базы.
    /// Сбрасываем перед чтением.
    /// </summary>
    private async Task<JsonElement> GetCardAsync(string gameId)
    {
        using (var scope = _factory.Services.CreateScope())
        {
            scope.ServiceProvider.GetRequiredService<IMemoryCache>().Remove(CatalogSnapshotService.CacheKey);
        }

        var response = await _factory.CreateClient().GetAsync("/api/game");
        response.EnsureSuccessStatusCode();

        var catalog = await response.Content.ReadFromJsonAsync<JsonElement>();
        return catalog.EnumerateArray().Single(item => item.GetProperty("id").GetString() == gameId);
    }

    // ---------- оценка ----------

    [Fact]
    public async Task Game_without_reviews_has_no_rating()
    {
        // null, а не ноль: «нет оценки» и «оценили на ноль» — разные сообщения покупателю.
        var gameId = await SeedGameAsync();

        var card = await GetCardAsync(gameId);

        Assert.Equal(JsonValueKind.Null, card.GetProperty("rating").ValueKind);
        Assert.Equal(0, card.GetProperty("reviewCount").GetInt32());
    }

    [Fact]
    public async Task Rating_averages_published_reviews_of_that_game()
    {
        var gameId = await SeedGameAsync();
        await SeedReviewAsync(gameId, 5);
        await SeedReviewAsync(gameId, 4);

        // Отзыв на соседнюю игру не должен подмешаться в оценку этой.
        await SeedReviewAsync(await SeedGameAsync(), 1);

        var card = await GetCardAsync(gameId);

        Assert.Equal(4.5, card.GetProperty("rating").GetDouble(), precision: 3);
        Assert.Equal(2, card.GetProperty("reviewCount").GetInt32());
    }

    [Fact]
    public async Task Hidden_review_does_not_affect_the_card()
    {
        var gameId = await SeedGameAsync();
        await SeedReviewAsync(gameId, 5);
        await SeedReviewAsync(gameId, 1, ReviewStatus.Hidden);

        var card = await GetCardAsync(gameId);

        Assert.Equal(5.0, card.GetProperty("rating").GetDouble(), precision: 3);
        Assert.Equal(1, card.GetProperty("reviewCount").GetInt32());
    }

    // ---------- наличие ----------

    [Fact]
    public async Task Game_without_keys_is_out_of_stock()
    {
        var gameId = await SeedGameAsync();

        var card = await GetCardAsync(gameId);

        Assert.False(card.GetProperty("inStock").GetBoolean());
    }

    [Fact]
    public async Task Healthy_stock_does_not_reveal_its_size()
    {
        // Сколько именно ключей в запасе — коммерческая информация: наружу уходит
        // только факт наличия, пока запас не стал критично малым.
        var gameId = await SeedGameAsync();
        await SeedPoolKeysAsync(gameId, GameController.LowStockThreshold + 5);

        var card = await GetCardAsync(gameId);

        Assert.True(card.GetProperty("inStock").GetBoolean());
        Assert.Equal(JsonValueKind.Null, card.GetProperty("lowStockLeft").ValueKind);
    }

    [Fact]
    public async Task Small_stock_is_named_out_loud()
    {
        var gameId = await SeedGameAsync();
        await SeedPoolKeysAsync(gameId, GameController.LowStockThreshold);

        var card = await GetCardAsync(gameId);

        Assert.True(card.GetProperty("inStock").GetBoolean());
        Assert.Equal(GameController.LowStockThreshold, card.GetProperty("lowStockLeft").GetInt32());
    }

    [Fact]
    public async Task Upcoming_game_is_never_reported_as_sold_out()
    {
        // У невышедшей игры ключей закономерно нет. «Нет в наличии» здесь соврало бы:
        // товар не кончился, он ещё не вышел — и об этом говорит дата релиза.
        var gameId = await SeedGameAsync(releaseDate: DateTime.UtcNow.AddMonths(6));

        var card = await GetCardAsync(gameId);

        Assert.True(card.GetProperty("isComingSoon").GetBoolean());
        Assert.True(card.GetProperty("inStock").GetBoolean());
        Assert.Equal(JsonValueKind.Null, card.GetProperty("lowStockLeft").ValueKind);
    }

    // ---------- платформы ----------

    [Fact]
    public async Task Platforms_come_from_the_key_types_we_actually_stock()
    {
        // Раньше платформы брались из описания игры, которое заполняют руками и часто забывают.
        // Ключи — это факт: если в пуле лежит ключ Xbox, игра продаётся для Xbox.
        var gameId = await SeedGameAsync();
        await SeedPoolKeysAsync(gameId, 2, "Xbox Live");
        await SeedPoolKeysAsync(gameId, 2, "PSN RU");

        var platforms = PlatformsOf(await GetCardAsync(gameId));

        Assert.Contains("Xbox", platforms);
        Assert.Contains("PlayStation", platforms);
        Assert.DoesNotContain("PC", platforms);
    }

    [Fact]
    public async Task Unknown_key_type_counts_as_a_pc_key()
    {
        // Тип ключа админ вводит руками, и список магазинов пополняется. Незнакомую строку
        // считаем ключом для ПК: магазин PC-first, и карточка не остаётся без иконки.
        var gameId = await SeedGameAsync();
        await SeedPoolKeysAsync(gameId, 1, "Some Launcher Nobody Knows");

        Assert.Equal(new[] { "PC" }, PlatformsOf(await GetCardAsync(gameId)));
    }

    [Fact]
    public async Task Selling_out_does_not_erase_the_platform()
    {
        // Запас кончился — но игра всё равно продаётся для этой платформы, и иконка
        // с карточки пропадать не должна.
        var gameId = await SeedGameAsync();
        await SeedPoolKeysAsync(gameId, 1, "Xbox Live");

        using (var scope = _factory.Services.CreateScope())
        {
            var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();
            Assert.NotNull(await keys.TryDispensePoolKeyAsync(gameId, "buyer-platform"));
        }

        var card = await GetCardAsync(gameId);

        Assert.False(card.GetProperty("inStock").GetBoolean());
        Assert.Contains("Xbox", PlatformsOf(card));
    }

    [Fact]
    public async Task Delivered_keys_no_longer_count_as_stock()
    {
        // Выданный ключ остаётся в коллекции, но продать его второй раз нельзя.
        var gameId = await SeedGameAsync();
        await SeedPoolKeysAsync(gameId, 1);

        using (var scope = _factory.Services.CreateScope())
        {
            var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();
            var dispensed = await keys.TryDispensePoolKeyAsync(gameId, "buyer-1");
            Assert.NotNull(dispensed);
        }

        var card = await GetCardAsync(gameId);

        Assert.False(card.GetProperty("inStock").GetBoolean());
    }
}
