using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Regions;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Склад в разрезе областей активации.
///
/// Общий остаток молчит о главном: партия «EU» может кончиться, пока «Global» ещё лежит, и
/// европейцу продать будет нечего при «полном» складе. Этот отчёт отвечает на вопрос «где
/// пополнять» и обязан отличать «регион кончился» от «региона у нас никогда не было».
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class KeyRegionStockTests
{
    private readonly TaleShopApiFactory _factory;

    public KeyRegionStockTests(TaleShopApiFactory factory) => _factory = factory;

    private static readonly RegionPolicy EuOnly = new() { Mode = "Regions", Regions = new() { "EU" } };

    private async Task<string> SeedGameAsync(bool priceTheEuOffer)
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var slug = $"rs-{Guid.NewGuid():N}"[..20];
        var id = ObjectId.GenerateNewId().ToString();
        await games.CreateAsync(new Game
        {
            Id = id,
            Name = slug,
            Title = slug,
            Slug = slug,
            Price = 20m,
            Currency = "USD",
            ImagePath = "c.png",
            ReleaseDate = DateTime.UtcNow.AddYears(-1),
            RegionPrices = priceTheEuOffer
                ? new List<RegionPrice> { new() { OfferKey = RegionOffer.KeyOf(EuOnly), Price = 15m } }
                : null
        });
        return id;
    }

    private HttpClient AdminClient()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "owner@taleshop.test");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        return client;
    }

    private static async Task<JsonElement> Body(HttpResponseMessage response) =>
        JsonSerializer.Deserialize<JsonElement>(await response.Content.ReadAsStringAsync());

    private static JsonElement RegionRow(JsonElement body, string offerKey) =>
        body.GetProperty("regions").EnumerateArray().Single(row => row.GetProperty("offerKey").GetString() == offerKey);

    [Fact]
    public async Task Report_counts_keys_by_activation_region()
    {
        var gameId = await SeedGameAsync(priceTheEuOffer: false);
        using (var scope = _factory.Services.CreateScope())
        {
            var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();
            await keys.AddPoolKeysAsync(gameId, "Steam", new[] { "RS-EU-0001", "RS-EU-0002" }, regionPolicy: EuOnly);
            await keys.AddPoolKeysAsync(gameId, "Steam", new[] { "RS-GL-0001" }, regionPolicy: RegionPolicy.Anywhere());
        }

        var body = await Body(await AdminClient().GetAsync("/api/admin/keys/overview/by-region"));

        // Порог «мало» приходит вместе с отчётом: по нему админка красит график и предупреждения,
        // и он обязан быть тем же, что в таблице остатков, — иначе два разных «мало» на одной странице.
        Assert.True(body.GetProperty("lowThreshold").GetInt32() >= 0);

        var europe = RegionRow(body, RegionOffer.KeyOf(EuOnly));
        Assert.Equal("Europe", europe.GetProperty("title").GetString());

        // Список игр области: сводка «46 игр» не отвечает, какие именно, — отчёт их называет.
        var listed = europe.GetProperty("games").EnumerateArray()
            .Select(g => g.GetProperty("gameId").GetString())
            .ToList();
        Assert.Contains(gameId, listed);
        // Срез ограничен, поэтому отчёт не обещает полный перечень, а честно помечает обрезание.
        Assert.Contains(europe.GetProperty("gamesTruncated").ValueKind, new[] { JsonValueKind.True, JsonValueKind.False });
        // Считаем только эту игру: в общей базе тестов есть и другие ключи.
        Assert.True(europe.GetProperty("available").GetInt32() >= 2);
        Assert.True(europe.GetProperty("gamesInStock").GetInt32() >= 1);
    }

    [Fact]
    public async Task A_region_that_sold_out_is_listed_for_restock_and_an_untouched_one_is_not()
    {
        // Европейские ключи были и кончились — регион продавался, его надо пополнить.
        var soldOut = await SeedGameAsync(priceTheEuOffer: false);
        using (var scope = _factory.Services.CreateScope())
        {
            var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();
            await keys.AddPoolKeysAsync(soldOut, "Steam", new[] { "RS-SOLD-0001" }, regionPolicy: EuOnly);
            await keys.TryDispensePoolKeyAsync(soldOut, "buyer@example.com", null, null, null, null, RegionOffer.KeyOf(EuOnly));
        }

        var body = await Body(await AdminClient().GetAsync("/api/admin/keys/overview/by-region"));
        var europe = RegionRow(body, RegionOffer.KeyOf(EuOnly));
        var waiting = europe.GetProperty("needRestock").EnumerateArray().Select(row => row.GetProperty("gameId").GetString()).ToList();

        Assert.Contains(soldOut, waiting);

        // …и в общем списке пустых: у нуля нет «дней запаса», на графике его не видно вовсе,
        // поэтому самое срочное — то, что продать уже нечем, — выносится отдельно.
        var empty = body.GetProperty("outOfKeys").EnumerateArray().ToList();
        var row = empty.Single(x => x.GetProperty("gameId").GetString() == soldOut);
        Assert.Equal(0, row.GetProperty("available").GetInt32());
        Assert.True(row.GetProperty("delivered").GetInt32() > 0);
        Assert.True(body.GetProperty("outOfKeysTotal").GetInt32() >= empty.Count);
    }

    [Fact]
    public async Task Usage_is_reported_per_day_and_turns_into_days_of_cover()
    {
        // Свой регион, в который больше никто не продаёт: итоги по региону (темп, активные дни,
        // запас) считаются по всем играм, и продажи соседних тестов в EU сдвигали бы их.
        var latamOnly = new RegionPolicy { Mode = "Regions", Regions = new() { "LATAM" } };
        var gameId = await SeedGameAsync(priceTheEuOffer: false);
        using (var scope = _factory.Services.CreateScope())
        {
            var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();
            await keys.AddPoolKeysAsync(gameId, "Steam", new[] { "RS-USE-1", "RS-USE-2", "RS-USE-3" }, regionPolicy: latamOnly);
            // Один ключ уходит сегодня: расход появляется в последнем столбце графика.
            await keys.TryDispensePoolKeyAsync(gameId, "buyer@example.com", null, null, null, null, RegionOffer.KeyOf(latamOnly));
        }

        var body = await Body(await AdminClient().GetAsync("/api/admin/keys/overview/by-region?days=30"));

        var days = body.GetProperty("days").EnumerateArray().Select(d => d.GetString()).ToList();
        Assert.Equal(30, days.Count);
        Assert.Equal(DateTime.UtcNow.ToString("yyyy-MM-dd"), days.Last());

        var latam = RegionRow(body, RegionOffer.KeyOf(latamOnly));
        var daily = latam.GetProperty("daily").EnumerateArray().Select(x => x.GetInt32()).ToList();
        Assert.Equal(days.Count, daily.Count);
        // Сегодняшняя выдача видна в кривой, и она же поднимает средний расход выше нуля.
        Assert.True(daily.Last() >= 1);
        Assert.True(latam.GetProperty("soldInWindow").GetInt32() >= 1);
        Assert.True(latam.GetProperty("perDay").GetDouble() > 0);
        // «Хватит на N дней» — это остаток, делённый на средний расход, а не выдумка.
        Assert.True(latam.GetProperty("daysLeft").GetInt32() > 0);

        // Темп считается с первой продажи, а не по всему окну: продали сегодня — активный день один,
        // и «1 ключ в день» не размазывается в 1/30. Иначе месяц простоя перед стартом продаж
        // делал бы любую игру «медленной» и обещал запас, которого нет.
        Assert.Equal(1, latam.GetProperty("activeDays").GetInt32());
        Assert.Equal(1, latam.GetProperty("perDay").GetDouble());
    }

    [Fact]
    public async Task A_game_that_sells_fast_is_flagged_before_one_that_simply_has_few_keys()
    {
        // Две игры в одной области: у быстрой ключей БОЛЬШЕ, но она уходит и кончится раньше.
        // Отчёт обязан ставить её выше — иначе «мало ключей» и «скоро кончится» путаются.
        var fast = await SeedGameAsync(priceTheEuOffer: false);
        var slow = await SeedGameAsync(priceTheEuOffer: false);

        using (var scope = _factory.Services.CreateScope())
        {
            var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();

            // Быстрая: 12 ключей в пуле и 8 проданных за окно.
            var fastKeys = Enumerable.Range(1, 20).Select(i => $"RS-FAST-{i:00}-{Guid.NewGuid():N}"[..22]).ToArray();
            await keys.AddPoolKeysAsync(fast, "Steam", fastKeys, regionPolicy: EuOnly);
            for (var i = 0; i < 8; i++)
            {
                await keys.TryDispensePoolKeyAsync(fast, $"buyer-{i}@example.com", null, null, null, null, RegionOffer.KeyOf(EuOnly));
            }

            // Медленная: 3 ключа и ни одной продажи.
            var slowKeys = Enumerable.Range(1, 3).Select(i => $"RS-SLOW-{i:00}-{Guid.NewGuid():N}"[..22]).ToArray();
            await keys.AddPoolKeysAsync(slow, "Steam", slowKeys, regionPolicy: EuOnly);
        }

        var body = await Body(await AdminClient().GetAsync("/api/admin/keys/overview/by-region?days=30"));
        var europe = RegionRow(body, RegionOffer.KeyOf(EuOnly));
        var listed = europe.GetProperty("games").EnumerateArray().ToList();

        var fastRow = listed.Single(g => g.GetProperty("gameId").GetString() == fast);
        var slowRow = listed.Single(g => g.GetProperty("gameId").GetString() == slow);

        // У быстрой есть скорость и срок, у медленной — прочерк вместо выдуманного прогноза.
        Assert.True(fastRow.GetProperty("perDay").GetDouble() > 0);
        Assert.True(fastRow.GetProperty("daysLeft").GetInt32() > 0);
        Assert.Equal(JsonValueKind.Null, slowRow.GetProperty("daysLeft").ValueKind);

        // И она стоит выше, хотя ключей у неё больше.
        Assert.True(fastRow.GetProperty("available").GetInt32() > slowRow.GetProperty("available").GetInt32());
        Assert.True(listed.IndexOf(fastRow) < listed.IndexOf(slowRow));

        Assert.Equal(7, body.GetProperty("soonDays").GetInt32());

        // Разрез для графиков — по играм. База тестов общая, и в верхушку из двенадцати игр
        // могла попасть чужая: проверяем контракт, а не место конкретной игры в списке.
        var series = body.GetProperty("games").EnumerateArray().ToList();
        Assert.NotEmpty(series);
        Assert.All(series, entry => Assert.Equal(30, entry.GetProperty("daily").GetArrayLength()));
        // Каждая серия — про игру в конкретной области: без этого график по играм не собрать.
        Assert.All(series, entry =>
        {
            Assert.False(string.IsNullOrWhiteSpace(entry.GetProperty("title").GetString()));
            Assert.False(string.IsNullOrWhiteSpace(entry.GetProperty("regionTitle").GetString()));
        });
        // Итог по дням не меньше наших восьми выдач: по нему график считает полосу «остальные».
        var total = body.GetProperty("totalDaily").EnumerateArray().Sum(x => x.GetInt32());
        Assert.True(total >= 8, $"expected at least 8 deliveries in the window, got {total}");
    }

    [Fact]
    public async Task A_region_that_never_sold_gets_no_made_up_forecast()
    {
        var gameId = await SeedGameAsync(priceTheEuOffer: false);
        using (var scope = _factory.Services.CreateScope())
        {
            var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();
            await keys.AddPoolKeysAsync(gameId, "Steam", new[] { $"RS-IDLE-{Guid.NewGuid():N}"[..18] },
                regionPolicy: new RegionPolicy { Mode = "Regions", Regions = new() { "OCEANIA" } });
        }

        var body = await Body(await AdminClient().GetAsync("/api/admin/keys/overview/by-region?days=7"));
        var idle = RegionRow(body, RegionOffer.KeyOf(new RegionPolicy { Mode = "Regions", Regions = new() { "OCEANIA" } }));

        // Ничего не продавалось — прогноза нет: ни «хватит навсегда», ни «кончится завтра».
        Assert.Equal(0, idle.GetProperty("soldInWindow").GetInt32());
        Assert.Equal(JsonValueKind.Null, idle.GetProperty("perDay").ValueKind);
        Assert.Equal(JsonValueKind.Null, idle.GetProperty("daysLeft").ValueKind);
    }

    [Fact]
    public async Task A_region_the_shop_priced_but_never_stocked_is_listed_too()
    {
        // Цена за европейский вариант назначена — магазин объявил, что продаёт его. Ключей нет,
        // значит покупатель увидит вариант и не сможет его получить: это тоже «пополнить».
        var priced = await SeedGameAsync(priceTheEuOffer: true);
        using (var scope = _factory.Services.CreateScope())
        {
            var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();
            await keys.AddPoolKeysAsync(priced, "Steam", new[] { "RS-PRICED-0001" }, regionPolicy: RegionPolicy.Anywhere());
        }

        var body = await Body(await AdminClient().GetAsync("/api/admin/keys/overview/by-region"));
        var europe = RegionRow(body, RegionOffer.KeyOf(EuOnly));
        var waiting = europe.GetProperty("needRestock").EnumerateArray().Select(row => row.GetProperty("gameId").GetString()).ToList();

        Assert.Contains(priced, waiting);

        // А глобальный регион у этой игры в порядке — в списке пополнения её быть не должно.
        var global = RegionRow(body, "global");
        var globalWaiting = global.GetProperty("needRestock").EnumerateArray().Select(row => row.GetProperty("gameId").GetString()).ToList();
        Assert.DoesNotContain(priced, globalWaiting);
    }

    [Fact]
    public async Task Default_region_policy_is_saved_by_its_own_endpoint()
    {
        // Атрибут маршрута этого запроса однажды «уехал» на соседний метод цены варианта:
        // PUT region-policy молча писал цену, а политика игры не менялась вовсе.
        var gameId = await SeedGameAsync(priceTheEuOffer: true);

        var response = await AdminClient().PutAsJsonAsync($"/api/admin/keys/inventory/{gameId}/region-policy", EuOnly);
        response.EnsureSuccessStatusCode();

        using var scope = _factory.Services.CreateScope();
        var game = await scope.ServiceProvider.GetRequiredService<IGameRepository>().GetByIdAsync(gameId);
        Assert.NotNull(game!.RegionPolicy);
        Assert.Equal(new[] { "EU" }, game.RegionPolicy!.Regions);
        // Цена EU-варианта, заданная при создании игры, осталась нетронутой.
        Assert.Single(game.RegionPrices!);
        Assert.Equal(15m, game.RegionPrices![0].Price);
    }
}
