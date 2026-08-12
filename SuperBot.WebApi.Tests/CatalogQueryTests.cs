using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Services;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Постраничная выдача каталога: отбор, поиск, порядок и счётчики фильтров теперь считает
/// сервер, а не витрина. Раньше клиент забирал весь каталог и резал его у себя — работало,
/// пока игр полсотни.
///
/// Тесты держат за горло именно те места, где легко сломать незаметно: границы страниц,
/// порядок сортировок и правило счётчиков (вариант фильтра считается со всеми остальными
/// условиями, но без своего собственного).
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class CatalogQueryTests
{
    private readonly TaleShopApiFactory _factory;

    public CatalogQueryTests(TaleShopApiFactory factory) => _factory = factory;

    // ---------- helpers ----------

    /// <summary>
    /// Каталог собирается один раз и кладётся в кэш, поэтому игры, заведённые в обход
    /// админского API, сами по себе на витрине не появятся — как и в бою после прямой
    /// правки базы. Сбрасываем явно.
    /// </summary>
    private void RefreshCatalog()
    {
        using var scope = _factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<IMemoryCache>().Remove(CatalogSnapshotService.CacheKey);
    }

    private async Task<string> SeedGameAsync(
        string title,
        decimal price = 20m,
        GameType gameType = GameType.Action,
        DateTime? releaseDate = null)
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();

        await games.CreateAsync(new Game
        {
            Name = title,
            Title = title,
            Slug = $"query-probe-{Guid.NewGuid():N}",
            Price = price,
            GameType = gameType,
            ImagePath = "cover.png",
            Description = "probe",
            ReleaseDate = releaseDate ?? DateTime.UtcNow.AddYears(-1)
        });

        var all = await games.GetAllAsync();
        return all.First(game => game.Title == title).Id!;
    }

    private async Task SeedPoolKeysAsync(string gameId, int count, string keyType = "Steam Key")
    {
        using var scope = _factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<IGameKeyRepository>()
            .AddPoolKeysAsync(gameId, keyType, Enumerable.Range(0, count).Select(_ => $"QRY-{Guid.NewGuid():N}"));
    }

    private async Task SeedDiscountAsync(string gameId, decimal percent)
    {
        using var scope = _factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<IGameDiscountRepository>().UpsertAsync(new GameDiscount
        {
            GameId = gameId,
            DiscountPercent = percent,
            StartDate = DateTime.UtcNow.AddDays(-1),
            EndDate = DateTime.UtcNow.AddDays(1)
        });
    }

    /// <summary>
    /// База общая на весь прогон, поэтому каждый тест метит свои игры уникальным словом
    /// и всегда ищет по нему — иначе в выдачу подмешались бы игры соседних тестов.
    /// </summary>
    private static string NewMarker() => $"qmark{Guid.NewGuid():N}";

    private async Task<JsonElement> GetCatalogAsync(string query)
    {
        var response = await _factory.CreateClient().GetAsync($"/api/game/catalog?{query}");
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    private static string[] TitlesOf(JsonElement page) =>
        page.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("title").GetString()!).ToArray();

    private static int FacetCount(JsonElement page, string facet, string value) =>
        page.GetProperty("facets").GetProperty(facet).EnumerateArray()
            .Where(entry => entry.GetProperty("value").GetString() == value)
            .Select(entry => entry.GetProperty("count").GetInt32())
            .FirstOrDefault();

    // ---------- страницы ----------

    [Fact]
    public async Task Page_holds_the_requested_size_while_total_counts_everything()
    {
        var marker = NewMarker();
        for (var index = 0; index < 5; index++)
        {
            await SeedGameAsync($"{marker} Game {index}");
        }
        RefreshCatalog();

        var page = await GetCatalogAsync($"q={marker}&pageSize=2&sort=name-asc");

        Assert.Equal(2, page.GetProperty("items").GetArrayLength());
        Assert.Equal(5, page.GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Second_page_continues_where_the_first_ended()
    {
        var marker = NewMarker();
        for (var index = 0; index < 5; index++)
        {
            await SeedGameAsync($"{marker} Game {index}");
        }
        RefreshCatalog();

        var first = TitlesOf(await GetCatalogAsync($"q={marker}&pageSize=2&page=1&sort=name-asc"));
        var second = TitlesOf(await GetCatalogAsync($"q={marker}&pageSize=2&page=2&sort=name-asc"));

        Assert.Empty(first.Intersect(second));
        Assert.Equal(4, first.Concat(second).Distinct().Count());
    }

    [Fact]
    public async Task Page_beyond_the_last_one_returns_the_last_one()
    {
        // Пустая страница вместо товара выглядит как поломка каталога, поэтому номер
        // страницы прижимается к последней существующей.
        var marker = NewMarker();
        await SeedGameAsync($"{marker} Only");
        RefreshCatalog();

        var page = await GetCatalogAsync($"q={marker}&pageSize=10&page=99");

        Assert.Equal(1, page.GetProperty("page").GetInt32());
        Assert.Single(page.GetProperty("items").EnumerateArray());
    }

    // ---------- порядок ----------

    [Fact]
    public async Task Sorting_by_price_uses_the_price_after_discount()
    {
        // Дешёвая игра со скидкой должна обгонять дорогую без скидки — сортировка идёт
        // по той цене, которую покупатель видит, а не по базовой.
        var marker = NewMarker();
        var expensive = await SeedGameAsync($"{marker} Expensive", price: 100m);
        await SeedGameAsync($"{marker} Cheap", price: 50m);
        await SeedDiscountAsync(expensive, 90m);
        RefreshCatalog();

        var titles = TitlesOf(await GetCatalogAsync($"q={marker}&sort=price-asc"));

        Assert.Equal($"{marker} Expensive", titles.First());
    }

    [Fact]
    public async Task Sorting_by_discount_ignores_expired_sales()
    {
        // Процент от закончившейся акции поднял бы наверх товар, который сейчас продаётся
        // по полной цене, — и витрина обещала бы скидку, которой нет.
        var marker = NewMarker();
        var live = await SeedGameAsync($"{marker} Live Sale", price: 100m);
        var expired = await SeedGameAsync($"{marker} Expired Sale", price: 100m);

        await SeedDiscountAsync(live, 20m);

        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<IGameDiscountRepository>().UpsertAsync(new GameDiscount
            {
                GameId = expired,
                DiscountPercent = 80m,
                StartDate = DateTime.UtcNow.AddDays(-10),
                EndDate = DateTime.UtcNow.AddDays(-1)
            });
        }
        RefreshCatalog();

        var titles = TitlesOf(await GetCatalogAsync($"q={marker}&sort=discount"));

        Assert.Equal($"{marker} Live Sale", titles.First());
    }

    [Fact]
    public async Task Sorting_by_reviews_puts_the_most_discussed_first()
    {
        var marker = NewMarker();
        var busy = await SeedGameAsync($"{marker} Busy");
        var quiet = await SeedGameAsync($"{marker} Quiet");

        using (var scope = _factory.Services.CreateScope())
        {
            var reviews = scope.ServiceProvider.GetRequiredService<IGameReviewRepository>();
            foreach (var gameId in new[] { busy, busy, quiet })
            {
                await reviews.CreateAsync(new GameReview
                {
                    GameId = gameId,
                    UserId = $"user-{Guid.NewGuid():N}",
                    UserName = "Player",
                    Rating = 4,
                    Text = "Review body.",
                    Status = ReviewStatus.Published,
                    CreatedAt = DateTime.UtcNow
                });
            }
        }
        RefreshCatalog();

        var titles = TitlesOf(await GetCatalogAsync($"q={marker}&sort=reviews"));

        Assert.Equal($"{marker} Busy", titles.First());
    }

    [Fact]
    public async Task Sorting_by_name_runs_both_ways()
    {
        var marker = NewMarker();
        await SeedGameAsync($"{marker} Alpha");
        await SeedGameAsync($"{marker} Omega");
        RefreshCatalog();

        var ascending = TitlesOf(await GetCatalogAsync($"q={marker}&sort=name-asc"));
        var descending = TitlesOf(await GetCatalogAsync($"q={marker}&sort=name-desc"));

        Assert.Equal($"{marker} Alpha", ascending.First());
        Assert.Equal($"{marker} Omega", descending.First());
    }

    // ---------- поиск ----------

    [Fact]
    public async Task Search_ignores_word_order_and_punctuation()
    {
        // Название пишут как придётся: без апострофа, слитно, словами вразнобой.
        var marker = NewMarker();
        await SeedGameAsync($"{marker} Baldur's Gate III");
        RefreshCatalog();

        var page = await GetCatalogAsync($"q={Uri.EscapeDataString($"gate baldurs {marker}")}");

        Assert.Single(page.GetProperty("items").EnumerateArray());
    }

    [Fact]
    public async Task Search_requires_every_word_to_match()
    {
        // Иначе лишнее слово в запросе не сужало бы выдачу, и поиск казался бы сломанным.
        var marker = NewMarker();
        await SeedGameAsync($"{marker} Silent Hill");
        RefreshCatalog();

        var page = await GetCatalogAsync($"q={Uri.EscapeDataString($"{marker} silent volcano")}");

        Assert.Equal(0, page.GetProperty("total").GetInt32());
    }

    // ---------- фильтры и их счётчики ----------

    [Fact]
    public async Task Choosing_a_category_keeps_the_other_categories_countable()
    {
        // Главное правило счётчиков: свой фасет из подсчёта исключается. Иначе выбор
        // одной категории обнулил бы все остальные и добавить вторую было бы нельзя.
        var marker = NewMarker();
        await SeedGameAsync($"{marker} Action One", gameType: GameType.Action);
        await SeedGameAsync($"{marker} Puzzle One", gameType: GameType.Puzzle);
        await SeedGameAsync($"{marker} Puzzle Two", gameType: GameType.Puzzle);
        RefreshCatalog();

        var page = await GetCatalogAsync($"q={marker}&categories=Action");

        Assert.Equal(1, page.GetProperty("total").GetInt32());
        Assert.Equal(2, FacetCount(page, "categories", "Puzzle"));
        Assert.Equal(1, FacetCount(page, "categories", "Action"));
    }

    [Fact]
    public async Task Other_filters_do_narrow_the_counts()
    {
        // Обратная сторона того же правила: чужие условия на счётчик влиять обязаны,
        // иначе число обещает больше, чем покупатель получит.
        var marker = NewMarker();
        var stocked = await SeedGameAsync($"{marker} Stocked", gameType: GameType.Puzzle);
        await SeedGameAsync($"{marker} Sold Out", gameType: GameType.Puzzle);
        await SeedPoolKeysAsync(stocked, 5);
        RefreshCatalog();

        var unfiltered = await GetCatalogAsync($"q={marker}");
        var inStockOnly = await GetCatalogAsync($"q={marker}&inStock=true");

        Assert.Equal(2, FacetCount(unfiltered, "categories", "Puzzle"));
        Assert.Equal(1, FacetCount(inStockOnly, "categories", "Puzzle"));
    }

    [Fact]
    public async Task Sold_out_games_can_be_hidden()
    {
        var marker = NewMarker();
        var stocked = await SeedGameAsync($"{marker} Stocked");
        await SeedGameAsync($"{marker} Sold Out");
        await SeedPoolKeysAsync(stocked, 2);
        RefreshCatalog();

        var page = await GetCatalogAsync($"q={marker}&inStock=true");

        Assert.Equal($"{marker} Stocked", Assert.Single(TitlesOf(page)));
        Assert.Equal(1, page.GetProperty("facets").GetProperty("availability").GetProperty("inStock").GetInt32());
    }

    [Fact]
    public async Task Discounted_games_can_be_shown_alone()
    {
        var marker = NewMarker();
        var discounted = await SeedGameAsync($"{marker} Discounted");
        await SeedGameAsync($"{marker} Full Price");
        await SeedDiscountAsync(discounted, 25m);
        RefreshCatalog();

        var page = await GetCatalogAsync($"q={marker}&onSale=true");

        Assert.Equal($"{marker} Discounted", Assert.Single(TitlesOf(page)));
        Assert.Equal(1, page.GetProperty("facets").GetProperty("availability").GetProperty("onSale").GetInt32());
    }

    [Fact]
    public async Task Upcoming_games_are_counted_separately()
    {
        var marker = NewMarker();
        await SeedGameAsync($"{marker} Released");
        await SeedGameAsync($"{marker} Future", releaseDate: DateTime.UtcNow.AddMonths(8));
        RefreshCatalog();

        var page = await GetCatalogAsync($"q={marker}&comingSoon=true");

        Assert.Equal($"{marker} Future", Assert.Single(TitlesOf(page)));
        Assert.Equal(1, page.GetProperty("facets").GetProperty("availability").GetProperty("comingSoon").GetInt32());
    }

    [Fact]
    public async Task Console_games_can_be_filtered_by_the_keys_we_stock()
    {
        // Смысл фильтра платформ: показать то, для чего у нас есть ключи.
        var marker = NewMarker();
        var xbox = await SeedGameAsync($"{marker} Xbox Title");
        var pc = await SeedGameAsync($"{marker} PC Title");
        await SeedPoolKeysAsync(xbox, 2, "Xbox Live");
        await SeedPoolKeysAsync(pc, 2, "Steam Key");
        RefreshCatalog();

        var page = await GetCatalogAsync($"q={marker}&platforms=Xbox");

        Assert.Equal($"{marker} Xbox Title", Assert.Single(TitlesOf(page)));
        Assert.Equal(1, FacetCount(page, "platforms", "Xbox"));
        Assert.Equal(1, FacetCount(page, "platforms", "PC"));
    }

    // ---------- распределение цен ----------

    [Fact]
    public async Task Price_histogram_ignores_the_price_filter_itself()
    {
        // По гистограмме диапазон и выбирают. Схлопнись она до уже выбранного участка —
        // вернуть ползунок обратно было бы не по чему.
        var marker = NewMarker();
        await SeedGameAsync($"{marker} Cheap", price: 5m);
        await SeedGameAsync($"{marker} Pricey", price: 95m);
        RefreshCatalog();

        var page = await GetCatalogAsync($"q={marker}&minPrice=90&maxPrice=100");
        var histogram = page.GetProperty("facets").GetProperty("priceHistogram");
        var counted = histogram.EnumerateArray().Sum(bucket => bucket.GetProperty("count").GetInt32());

        Assert.Equal(1, page.GetProperty("total").GetInt32());
        // Обе игры остались в распределении, хотя фильтр оставил в выдаче одну.
        Assert.Equal(2, counted);
    }

    [Fact]
    public async Task Price_histogram_keeps_the_most_expensive_game_inside_the_last_bucket()
    {
        // Верхняя граница диапазона принадлежит последнему столбику; иначе самая дорогая
        // игра выпадала бы из распределения вовсе.
        var marker = NewMarker();
        await SeedGameAsync($"{marker} Floor", price: 1m);
        await SeedGameAsync($"{marker} Ceiling", price: 200m);
        RefreshCatalog();

        var page = await GetCatalogAsync($"q={marker}");
        var buckets = page.GetProperty("facets").GetProperty("priceHistogram").EnumerateArray().ToList();

        Assert.Equal(2, buckets.Sum(bucket => bucket.GetProperty("count").GetInt32()));
        Assert.Equal(1, buckets.Last().GetProperty("count").GetInt32());
    }

    [Fact]
    public async Task Price_presets_never_count_the_same_game_twice()
    {
        // Верхняя граница диапазона в него не входит: игра ровно за $10 принадлежит
        // «$10 – $25», а не сразу двум диапазонам. Ошибка тут незаметна — суммы просто
        // перестают сходиться с числом товара.
        var marker = NewMarker();
        await SeedGameAsync($"{marker} Nine", price: 9.99m);
        await SeedGameAsync($"{marker} Ten", price: 10m);
        await SeedGameAsync($"{marker} Fifty", price: 50m);
        RefreshCatalog();

        var page = await GetCatalogAsync($"q={marker}");
        var presets = page.GetProperty("facets").GetProperty("pricePresets").EnumerateArray().ToList();

        int CountOf(string label) => presets
            .Where(preset => preset.GetProperty("label").GetString() == label)
            .Select(preset => preset.GetProperty("count").GetInt32())
            .FirstOrDefault();

        Assert.Equal(3, presets.Sum(preset => preset.GetProperty("count").GetInt32()));
        Assert.Equal(1, CountOf("Under $10"));
        Assert.Equal(1, CountOf("$10 – $25"));
        Assert.Equal(1, CountOf("$50 and up"));
    }

    [Fact]
    public async Task Empty_price_presets_are_not_offered()
    {
        // Диапазон без товара — клик в пустоту, поэтому наружу он не уходит вовсе.
        var marker = NewMarker();
        await SeedGameAsync($"{marker} Cheap", price: 5m);
        RefreshCatalog();

        var page = await GetCatalogAsync($"q={marker}");
        var labels = page.GetProperty("facets").GetProperty("pricePresets").EnumerateArray()
            .Select(preset => preset.GetProperty("label").GetString())
            .ToList();

        Assert.Equal(new[] { "Under $10" }, labels);
    }

    [Fact]
    public async Task Price_bounds_describe_the_whole_catalog_not_the_current_result()
    {
        // Границы ползунка нельзя считать по отфильтрованной выдаче: они сжимались бы
        // с каждым движением, и вернуть диапазон обратно стало бы невозможно.
        var marker = NewMarker();
        await SeedGameAsync($"{marker} Cheap", price: 7m);
        await SeedGameAsync($"{marker} Pricey", price: 123m);
        RefreshCatalog();

        var narrowed = await GetCatalogAsync($"q={marker}&minPrice=100&maxPrice=130");
        var range = narrowed.GetProperty("priceRange");

        Assert.Equal(1, narrowed.GetProperty("total").GetInt32());
        Assert.True(range.GetProperty("max").GetDecimal() >= 123m);
        Assert.True(range.GetProperty("min").GetDecimal() <= 7m);
    }

    // ---------- свежесть ----------

    [Fact]
    public async Task Catalog_shows_a_game_created_through_the_admin_api()
    {
        // Собранный каталог живёт в кэше, поэтому запись через админку обязана его сбрасывать —
        // иначе новая игра появлялась бы на витрине с задержкой в несколько минут.
        var marker = NewMarker();
        RefreshCatalog();
        Assert.Equal(0, (await GetCatalogAsync($"q={marker}")).GetProperty("total").GetInt32());

        var admin = _factory.CreateClient();
        admin.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, $"admin-{Guid.NewGuid():N}@taleshop.test");
        admin.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");

        var created = await admin.PostAsJsonAsync("/api/game", new
        {
            slug = $"admin-probe-{Guid.NewGuid():N}",
            name = $"{marker} Fresh",
            title = $"{marker} Fresh",
            description = "created through the admin api",
            price = 15m,
            gameType = (int)GameType.Action,
            imagePath = "cover.png",
            releaseDate = DateTime.UtcNow.AddYears(-1)
        });
        created.EnsureSuccessStatusCode();

        Assert.Equal(1, (await GetCatalogAsync($"q={marker}")).GetProperty("total").GetInt32());
    }
}
