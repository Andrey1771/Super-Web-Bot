using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Демо-сид: на старте наполняет каталог (игры + детали + пул ключей + скидки) через настоящие
/// репозитории. Проверяем через реальный хост и эфемерную Mongo. В общей фабрике сид выключен,
/// поэтому поднимаем отдельный хост с Seed:Enabled=true — он изолирован (своя БД) и другие тесты
/// не задевает. Обложки рисует фронт (GameCoverPlaceholder), поэтому здесь их не проверяем.
/// </summary>
public class DemoSeedTests : IClassFixture<TaleShopApiFactory>
{
    private readonly TaleShopApiFactory _factory;

    public DemoSeedTests(TaleShopApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Demo_seed_populates_catalog()
    {
        await using var seeded = _factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Seed:Enabled", "true");
            builder.UseSetting("Seed:Force", "true");
        });

        var client = seeded.CreateClient(); // билд хоста → на старте отрабатывает сид

        using var scope = seeded.Services.CreateScope();
        var provider = scope.ServiceProvider;

        var games = await provider.GetRequiredService<IGameRepository>().GetAllAsync();
        Assert.True(games.Count >= 40, $"Expected a populated demo catalog, got {games.Count}.");

        var eldenRing = games.FirstOrDefault(g => g.Slug == "elden-ring");
        Assert.NotNull(eldenRing);

        // Детали и пул ключей заведены и связаны по GameId.
        var details = await provider.GetRequiredService<IGameDetailsRepository>().GetByGameIdAsync(eldenRing!.Id);
        Assert.NotNull(details);
        Assert.True(details.FinalPrice > 0);

        var available = await provider.GetRequiredService<IGameKeyRepository>().CountAvailableByGameAsync(eldenRing.Id);
        Assert.True(available > 0, "Seeded game should have keys in the pool.");

        // Каталожный API отдаёт то, на чём держится витрина: платформы (для фильтра) и активную скидку
        // (для зачёркнутой цены + бейджа). Без этого фильтр платформ пуст, а скидки не видны на карточках.
        var payload = await client.GetFromJsonAsync<List<JsonElement>>("/api/game");
        Assert.NotNull(payload);
        Assert.True(payload!.Count >= 40);

        Assert.Contains(payload, game =>
            game.TryGetProperty("platforms", out var platforms) &&
            platforms.ValueKind == JsonValueKind.Array &&
            platforms.GetArrayLength() > 0);

        Assert.Contains(payload, game =>
            game.TryGetProperty("discountActive", out var active) && active.GetBoolean() &&
            game.TryGetProperty("discountPercent", out var percent) &&
            percent.ValueKind == JsonValueKind.Number && percent.GetDecimal() > 0);

        // Рейтинг для карточки (звёзды + число отзывов) — из GameDetails через каталожный API.
        Assert.Contains(payload, game =>
            game.TryGetProperty("ratingAvg", out var avg) && avg.GetDouble() > 0 &&
            game.TryGetProperty("reviewsCount", out var count) && count.GetInt32() > 0);
    }
}
