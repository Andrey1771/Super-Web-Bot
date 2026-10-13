using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Regions;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Ошибки, найденные ревью перед коммитом: каждая — сценарий, который до исправления заканчивался потерей денег,
/// зависшим заказом или сломанной админкой. Тесты держат ровно эти сценарии.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class ReviewFixesTests
{
    private readonly TaleShopApiFactory _factory;

    public ReviewFixesTests(TaleShopApiFactory factory) => _factory = factory;

    private static readonly RegionPolicy EuOnly = new() { Mode = "Regions", Regions = new() { "EU" } };

    private HttpClient Admin()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "owner@taleshop.test");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        return client;
    }

    private async Task<Game> SeedGameAsync(Action<Game>? configure = null)
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var slug = $"rf-{Guid.NewGuid():N}"[..20];
        var game = new Game
        {
            Id = ObjectId.GenerateNewId().ToString(),
            Name = slug,
            Title = slug,
            Slug = slug,
            Price = 20m,
            Currency = "USD",
            ImagePath = "c.png",
            ReleaseDate = DateTime.UtcNow.AddYears(-1)
        };
        configure?.Invoke(game);
        await games.CreateAsync(game);
        return game;
    }

    private static Order PaidOrder(string gameId, string? editionCode = null, string? offerKey = null, string country = "DE")
    {
        var email = $"rf-{Guid.NewGuid():N}"[..14] + "@example.com";
        return new Order
        {
            Id = Guid.NewGuid(),
            OrderNumber = $"TS-RF-{Guid.NewGuid():N}"[..13],
            UserId = email,
            UserName = email,
            IsPaid = true,
            PaymentStatus = "PAID",
            Status = "PAID",
            Currency = "USD",
            OrderDate = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            BuyerCountry = country,
            TotalAmount = 20m,
            Totals = new MoneyTotals { Subtotal = 20m, Total = 20m },
            Items = new List<OrderItemSnapshot>
            {
                new() { GameId = gameId, Title = "Review fixes game", EditionCode = editionCode, OfferKey = offerKey, Quantity = 1, UnitPrice = 20m, FinalUnitPrice = 20m, LineTotal = 20m, Delivery = new DeliverySnapshot { DeliveryType = "Key" } }
            }
        };
    }

    [Fact]
    public async Task Region_key_is_found_even_behind_hundreds_of_keys_from_other_batches()
    {
        // Раньше выдача смотрела только первые 200 ключей пула: 300 глобальных впереди — и европеец не получал
        // ключ, хотя европейская партия лежала следом.
        var game = await SeedGameAsync();
        using var scope = _factory.Services.CreateScope();
        var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();
        var globalKeys = Enumerable.Range(0, 300).Select(i => $"GL-{i:D4}-{Guid.NewGuid():N}"[..20]).ToList();
        await keys.AddPoolKeysAsync(game.Id!, "Steam", globalKeys, regionPolicy: new RegionPolicy { Mode = RegionPolicy.ModeGlobal, ExcludedCountries = new() { "DE" } });
        await keys.AddPoolKeysAsync(game.Id!, "Steam", new[] { "EU-KEY-0001-AAAA" }, regionPolicy: EuOnly);

        var key = await keys.TryDispensePoolKeyAsync(game.Id!, "de-buyer", null, null, "DE", null, RegionOffer.KeyOf(EuOnly));

        Assert.NotNull(key);
        Assert.Equal("EU-KEY-0001-AAAA", key!.Key);
    }

    [Fact]
    public async Task Default_edition_order_draws_keys_tagged_with_its_code_and_untagged_ones()
    {
        // Наличие издания по умолчанию считается «с кодом + без кода» — выдача должна видеть оба запаса.
        var game = await SeedGameAsync();
        using var scope = _factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<IGameDetailsRepository>().UpsertAsync(new GameDetails
        {
            GameId = game.Id,
            Slug = game.Slug,
            Title = game.Title,
            Editions = new List<GameEdition>
            {
                new() { Code = "standard", Title = "Standard", Price = 20m, IsDefault = true },
                new() { Code = "deluxe", Title = "Deluxe", Price = 30m }
            }
        });
        var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();
        var orders = scope.ServiceProvider.GetRequiredService<IOrderRepository>();
        var fulfillment = scope.ServiceProvider.GetRequiredService<IKeyFulfillmentService>();

        // Ключ залит ПОД КОДОМ издания по умолчанию (через API или издание стало базовым после заливки).
        await keys.AddPoolKeysAsync(game.Id!, "Steam", new[] { "STD-TAGGED-0001" }, editionCode: "standard");
        var tagged = PaidOrder(game.Id!, editionCode: "standard");
        await orders.CreateOrderAsync(tagged);
        Assert.Equal("STD-TAGGED-0001", Assert.Single(await fulfillment.FulfillOrderAsync(tagged)).Key);

        // Ключ без кода — старый заказ без кода издания получает ключ, залитый под кодом, и наоборот.
        await keys.AddPoolKeysAsync(game.Id!, "Steam", new[] { "STD-UNTAGGED-01" });
        var withCode = PaidOrder(game.Id!, editionCode: "standard");
        await orders.CreateOrderAsync(withCode);
        Assert.Equal("STD-UNTAGGED-01", Assert.Single(await fulfillment.FulfillOrderAsync(withCode)).Key);

        // Deluxe чужие ключи не берёт.
        await keys.AddPoolKeysAsync(game.Id!, "Steam", new[] { "STD-UNTAGGED-02" });
        var deluxe = PaidOrder(game.Id!, editionCode: "deluxe");
        await orders.CreateOrderAsync(deluxe);
        Assert.Empty(await fulfillment.FulfillOrderAsync(deluxe));
    }

    [Fact]
    public async Task Activation_target_is_accepted_by_name_and_returned_by_name()
    {
        // Редактор шлёт «MicrosoftAccount»; раньше сервер принимал только число и отвечал 400.
        var game = await SeedGameAsync(g => g.Kind = ProductKind.Software);
        var admin = Admin();

        var saved = await admin.PutAsJsonAsync($"/api/admin/games/{game.Id}/details", new
        {
            gameId = game.Id,
            slug = game.Slug,
            title = game.Title,
            activation = new { target = "MicrosoftAccount", url = "https://account.microsoft.example", label = "Microsoft account" },
            editions = new object[] { new { code = "1y-1", title = "1 year", price = 20m, isDefault = true, licenseTermMonths = 12, licenseDevices = 1 } }
        });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);

        var details = await (await admin.GetAsync($"/api/admin/games/{game.Id}/details")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("MicrosoftAccount", details.GetProperty("activation").GetProperty("target").GetString());
        // Подпись лицензии считает сервер и отдаёт готовой — витрина, кабинет и письмо называют её одинаково.
        Assert.Equal("1 year · 1 device", details.GetProperty("editions")[0].GetProperty("label").GetString());

        // Число по-прежнему принимается — старые клиенты шлют его.
        var numeric = await admin.PutAsJsonAsync($"/api/admin/games/{game.Id}/details", new { gameId = game.Id, slug = game.Slug, title = game.Title, activation = new { target = 2 } });
        Assert.Equal(HttpStatusCode.OK, numeric.StatusCode);
    }

    [Fact]
    public async Task Partial_game_update_keeps_fields_the_form_does_not_send()
    {
        var game = await SeedGameAsync(g =>
        {
            g.LowStockThreshold = 7;
            g.LowStockFromUtc = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            g.RegionPolicy = EuOnly;
            g.RegionPrices = new List<RegionPrice> { new() { OfferKey = RegionOffer.KeyOf(EuOnly), Price = 15m } };
            g.Prices = new Dictionary<string, decimal> { ["EUR"] = 18m };
            g.ExternalId = "ext-1";
        });

        var response = await Admin().PutAsJsonAsync($"/api/game/{game.Id}", new { title = "Renamed", price = 25m });
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var saved = await scope.ServiceProvider.GetRequiredService<IGameRepository>().GetByIdAsync(game.Id!);
        Assert.Equal("Renamed", saved.Title);
        Assert.Equal(25m, saved.Price);
        // Всё, что форма не прислала, на месте — раньше документ подменялся целиком и эти поля обнулялись.
        Assert.Equal(7, saved.LowStockThreshold);
        Assert.NotNull(saved.LowStockFromUtc);
        Assert.NotNull(saved.RegionPolicy);
        Assert.Single(saved.RegionPrices!);
        Assert.Equal(18m, saved.Prices!["EUR"]);
        Assert.Equal("ext-1", saved.ExternalId);
        Assert.Equal(game.Slug, saved.Slug);
    }

    [Fact]
    public async Task Analytics_settings_document_with_a_removed_field_still_loads()
    {
        // Документ, сохранённый старым кодом, хранит YandexCounterId — чтение не должно падать.
        using var scope = _factory.Services.CreateScope();
        var collection = scope.ServiceProvider.GetRequiredService<IMongoDatabase>().GetCollection<BsonDocument>("AnalyticsSettings");
        var before = await collection.Find(FilterDefinition<BsonDocument>.Empty).ToListAsync();
        await collection.DeleteManyAsync(FilterDefinition<BsonDocument>.Empty);
        await collection.InsertOneAsync(new BsonDocument
        {
            { "_id", Guid.NewGuid().ToString() },
            { "GaMeasurementId", "G-TEST" },
            { "GaPropertyId", "1" },
            { "GtmContainerId", "" },
            { "YandexCounterId", BsonNull.Value },
            { "IsEnabled", true },
            { "CreatedAt", DateTime.UtcNow },
            { "UpdatedAt", DateTime.UtcNow }
        });
        try
        {
            var settings = await scope.ServiceProvider.GetRequiredService<IAnalyticsSettingsRepository>().GetAsync();
            Assert.Equal("G-TEST", settings.GaMeasurementId);
        }
        finally
        {
            await collection.DeleteManyAsync(FilterDefinition<BsonDocument>.Empty);
            if (before.Count > 0)
            {
                await collection.InsertManyAsync(before);
            }
        }
    }

    [Fact]
    public async Task Opening_a_product_by_its_title_does_not_overwrite_the_admin_card()
    {
        // Адрес карточки задан админом и не совпадает с названием; ссылка из названия раньше записывала поверх
        // карточки пустую заготовку.
        var game = await SeedGameAsync();
        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<IGameDetailsRepository>().UpsertAsync(new GameDetails
            {
                GameId = game.Id,
                Slug = $"{game.Slug}-2026",
                Title = game.Title,
                DescriptionMarkdown = "Hand-written description."
            });
        }

        var byTitle = await _factory.CreateClient().GetAsync($"/api/games/{game.Slug}");
        Assert.Equal(HttpStatusCode.OK, byTitle.StatusCode);
        var body = await byTitle.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Hand-written description.", body.GetProperty("game").GetProperty("descriptionMarkdown").GetString());

        using var check = _factory.Services.CreateScope();
        var details = await check.ServiceProvider.GetRequiredService<IGameDetailsRepository>().GetByGameIdAsync(game.Id!);
        Assert.Equal("Hand-written description.", details.DescriptionMarkdown);
        Assert.Equal($"{game.Slug}-2026", details.Slug);
    }

    [Fact]
    public async Task Keys_overview_lists_drafts_like_the_dashboard_does()
    {
        var game = await SeedGameAsync();
        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<IGameDetailsRepository>().UpsertAsync(new GameDetails { GameId = game.Id, Slug = game.Slug, Title = game.Title, IsDraft = true });
            await scope.ServiceProvider.GetRequiredService<IGameKeyRepository>().AddPoolKeysAsync(game.Id!, "Steam", new[] { "DRAFT-KEY-0001-A" });
            scope.ServiceProvider.GetRequiredService<SuperBot.WebApi.Services.ICatalogSnapshotService>().Invalidate();
        }

        var overview = await (await Admin().GetAsync($"/api/admin/keys/overview?query={game.Slug}&status=all")).Content.ReadFromJsonAsync<JsonElement>();
        var row = Assert.Single(overview.GetProperty("games").EnumerateArray());
        Assert.Equal(game.Id, row.GetProperty("gameId").GetString());
        Assert.Equal(1, row.GetProperty("available").GetInt32());
    }
}
