using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Controllers;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Витринные агрегаты главной страницы: недельный чарт продаж и состав баннера
/// «Deal of the week». Оба считаются на сервере и кэшируются, поэтому проверяем
/// и содержимое, и то, что кэш не отдаёт устаревший состав после правки в админке.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class StorefrontShelvesTests
{
    private readonly TaleShopApiFactory _factory;

    public StorefrontShelvesTests(TaleShopApiFactory factory) => _factory = factory;

    // ---------- helpers ----------

    private HttpClient CreateClient(bool admin = false)
    {
        var client = _factory.CreateClient();
        if (admin)
        {
            client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, $"admin-{Guid.NewGuid():N}@taleshop.test");
            client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        }
        return client;
    }

    /// <summary>Агрегаты кэшируются — без сброса соседний тест увидел бы чужой результат.</summary>
    private void ResetCaches()
    {
        using var scope = _factory.Services.CreateScope();
        var cache = scope.ServiceProvider.GetRequiredService<IMemoryCache>();
        cache.Remove(GameController.WeeklyChartCacheKey);
        cache.Remove(DealOfWeekController.SpotlightCacheKey);
    }

    private async Task<string> SeedGameAsync(decimal price = 10m, DateTime? releaseDate = null)
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();

        var name = $"Shelf Game {Guid.NewGuid():N}";
        await games.CreateAsync(new Game
        {
            Name = name,
            Title = name,
            Price = price,
            ImagePath = "cover.png",
            ReleaseDate = releaseDate ?? DateTime.UtcNow.AddYears(-1)
        });

        var all = await games.GetAllAsync();
        return all.First(game => game.Name == name).Id!;
    }

    /// <summary>Оплаченный заказ на игру: именно из таких строк складывается чарт.</summary>
    private async Task SeedPaidOrderAsync(string gameId, int quantity, DateTime paidAt)
    {
        using var scope = _factory.Services.CreateScope();
        var orders = scope.ServiceProvider.GetRequiredService<IOrderRepository>();

        var id = Guid.NewGuid();
        await orders.CreateOrderAsync(new Order
        {
            Id = id,
            OrderGuid = id,
            UserId = $"chart-{Guid.NewGuid():N}",
            UserName = "chart-buyer",
            GameId = gameId,
            IsPaid = true,
            PaidAt = paidAt,
            OrderDate = paidAt,
            CreatedAt = paidAt,
            PaymentStatus = "PAID",
            Items = new List<OrderItemSnapshot>
            {
                new() { GameId = gameId, Title = "Shelf Game", Quantity = quantity }
            }
        });
    }

    /// <summary>Сбрасывает выбор админа, чтобы проверить именно серверный фолбэк.</summary>
    private async Task ClearSpotlightConfigAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var settings = scope.ServiceProvider.GetRequiredService<IDealOfWeekSettingsRepository>();
        await settings.UpsertAsync(new DealOfWeekSettings { HeroGameId = null, WingGameIds = new List<string>() });
    }

    private async Task SeedDiscountAsync(string gameId, decimal percent, int daysLeft = 3)
    {
        using var scope = _factory.Services.CreateScope();
        var discounts = scope.ServiceProvider.GetRequiredService<IGameDiscountRepository>();
        await discounts.UpsertAsync(new GameDiscount
        {
            GameId = gameId,
            DiscountPercent = percent,
            StartDate = DateTime.UtcNow.AddDays(-1),
            EndDate = DateTime.UtcNow.AddDays(daysLeft)
        });
    }

    private async Task<JsonElement> GetJsonAsync(string url)
    {
        var response = await CreateClient().GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
    }

    // ---------- weekly chart ----------

    [Fact]
    public async Task Weekly_chart_counts_only_sales_inside_the_window()
    {
        var fresh = await SeedGameAsync();
        var stale = await SeedGameAsync();

        await SeedPaidOrderAsync(fresh, quantity: 2, paidAt: DateTime.UtcNow.AddDays(-1));
        // Продажа месячной давности не должна попасть в НЕДЕЛЬНЫЙ чарт.
        await SeedPaidOrderAsync(stale, quantity: 50, paidAt: DateTime.UtcNow.AddDays(-30));
        ResetCaches();

        // Запрашиваем максимум: с выдачей по умолчанию свежая игра могла бы просто
        // не попасть в топ из-за продаж, накопленных соседними тестами.
        var chart = await GetJsonAsync("/api/game/weekly-chart?limit=24");
        var rows = chart.EnumerateArray().ToList();

        Assert.Contains(rows, row => row.GetProperty("gameId").GetString() == fresh);
        Assert.DoesNotContain(rows, row => row.GetProperty("gameId").GetString() == stale);
    }

    [Fact]
    public async Task Weekly_chart_sums_quantities_and_sorts_by_sales()
    {
        var popular = await SeedGameAsync();
        var niche = await SeedGameAsync();

        // Числа заведомо крупные: база общая на всю сборку, и с мелкими продажами
        // эти игры вытеснялись бы из выдачи заказами соседних тестов.
        await SeedPaidOrderAsync(popular, quantity: 700, paidAt: DateTime.UtcNow.AddHours(-2));
        await SeedPaidOrderAsync(popular, quantity: 300, paidAt: DateTime.UtcNow.AddHours(-1));
        await SeedPaidOrderAsync(niche, quantity: 900, paidAt: DateTime.UtcNow.AddHours(-3));
        ResetCaches();

        var rows = (await GetJsonAsync("/api/game/weekly-chart")).EnumerateArray().ToList();

        var popularRow = rows.First(row => row.GetProperty("gameId").GetString() == popular);
        var nicheRow = rows.First(row => row.GetProperty("gameId").GetString() == niche);

        // Два заказа одной игры складываются в одну строку чарта.
        Assert.Equal(1000, popularRow.GetProperty("sold").GetInt32());
        Assert.True(rows.IndexOf(popularRow) < rows.IndexOf(nicheRow), "Больше продаж — выше место в чарте.");
    }

    [Fact]
    public async Task Weekly_chart_respects_limit()
    {
        for (var i = 0; i < 3; i++)
        {
            var gameId = await SeedGameAsync();
            await SeedPaidOrderAsync(gameId, quantity: i + 1, paidAt: DateTime.UtcNow.AddHours(-1));
        }
        ResetCaches();

        var rows = (await GetJsonAsync("/api/game/weekly-chart?limit=2")).EnumerateArray().ToList();

        Assert.Equal(2, rows.Count);
    }

    [Fact]
    public async Task Unpaid_orders_never_reach_the_chart()
    {
        var gameId = await SeedGameAsync();

        using (var scope = _factory.Services.CreateScope())
        {
            var orders = scope.ServiceProvider.GetRequiredService<IOrderRepository>();
            var id = Guid.NewGuid();
            await orders.CreateOrderAsync(new Order
            {
                Id = id,
                OrderGuid = id,
                UserId = "unpaid-buyer",
                GameId = gameId,
                IsPaid = false,
                OrderDate = DateTime.UtcNow.AddHours(-1),
                Items = new List<OrderItemSnapshot>
                {
                    new() { GameId = gameId, Title = "Unpaid", Quantity = 99 }
                }
            });
        }
        ResetCaches();

        var rows = (await GetJsonAsync("/api/game/weekly-chart")).EnumerateArray().ToList();

        Assert.DoesNotContain(rows, row => row.GetProperty("gameId").GetString() == gameId);
    }

    // ---------- deal of the week ----------

    [Fact]
    public async Task Deal_of_week_falls_back_to_deepest_live_discount()
    {
        var deep = await SeedGameAsync(price: 50m);
        var shallow = await SeedGameAsync(price: 50m);
        // Скидка заведомо глубже, чем в соседних тестах: база общая, и претендент
        // с бо́льшим процентом перебил бы фолбэк.
        await SeedDiscountAsync(deep, percent: 99m);
        await SeedDiscountAsync(shallow, percent: 10m);

        // Фолбэк включается только при пустом конфиге, а соседний тест мог сохранить героя.
        await ClearSpotlightConfigAsync();
        ResetCaches();

        var spotlight = await GetJsonAsync("/api/deal-of-week");

        // Конфига нет — сервер сам выбирает самую глубокую живую скидку, баннер не пустует.
        Assert.Equal(deep, spotlight.GetProperty("heroGameId").GetString());
    }

    [Fact]
    public async Task Admin_choice_wins_and_hero_never_appears_in_wings()
    {
        var hero = await SeedGameAsync(price: 40m);
        var deeper = await SeedGameAsync(price: 40m);
        var wing = await SeedGameAsync();
        await SeedDiscountAsync(hero, percent: 25m);
        await SeedDiscountAsync(deeper, percent: 90m);

        var admin = CreateClient(admin: true);
        var saved = await admin.PutAsJsonAsync("/api/admin/deal-of-week", new
        {
            heroGameId = hero,
            // Героя в кулисах быть не должно — сервер обязан его отфильтровать.
            wingGameIds = new[] { wing, hero }
        });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);

        var spotlight = await GetJsonAsync("/api/deal-of-week");
        var wings = spotlight.GetProperty("wingGameIds").EnumerateArray().Select(id => id.GetString()).ToList();

        Assert.Equal(hero, spotlight.GetProperty("heroGameId").GetString());
        Assert.Contains(wing, wings);
        Assert.DoesNotContain(hero, wings);
    }

    [Fact]
    public async Task Saving_settings_drops_the_cache_immediately()
    {
        var first = await SeedGameAsync(price: 30m);
        var second = await SeedGameAsync(price: 30m);
        await SeedDiscountAsync(first, percent: 30m);
        await SeedDiscountAsync(second, percent: 35m);

        var admin = CreateClient(admin: true);
        await admin.PutAsJsonAsync("/api/admin/deal-of-week", new { heroGameId = first, wingGameIds = Array.Empty<string>() });
        var before = await GetJsonAsync("/api/deal-of-week");
        Assert.Equal(first, before.GetProperty("heroGameId").GetString());

        // Без сброса кэша админ до двух минут видел бы на главной прежнего героя.
        await admin.PutAsJsonAsync("/api/admin/deal-of-week", new { heroGameId = second, wingGameIds = Array.Empty<string>() });
        var after = await GetJsonAsync("/api/deal-of-week");

        Assert.Equal(second, after.GetProperty("heroGameId").GetString());
    }

    [Fact]
    public async Task Unknown_hero_is_rejected()
    {
        var admin = CreateClient(admin: true);

        var response = await admin.PutAsJsonAsync("/api/admin/deal-of-week", new
        {
            heroGameId = "not-a-real-game-id",
            wingGameIds = Array.Empty<string>()
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
