using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Services;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Заказы старой формы: каждое поле позиции лежит в документе дважды — актуальное имя и
/// legacy-дубль (Title/TitleSnapshot, Quantity/Qty …). До этого фикса один такой документ
/// валил десериализацию всей страницы заказов у покупателя (FormatException в
/// OrderMongoDbRepository.FetchPagedAsync). Проверяем обе линии защиты: класс терпит лишние
/// поля, а инициализатор их вычищает.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class LegacyOrderDocumentsTests
{
    private readonly TaleShopApiFactory _factory;

    public LegacyOrderDocumentsTests(TaleShopApiFactory factory) => _factory = factory;

    private static BsonDocument LegacyOrder(string orderId, string userName) => new()
    {
        { "OrderId", orderId },
        { "OrderGuid", Guid.NewGuid().ToString() },
        { "OrderNumber", $"TS-LEGACY-{orderId[..6]}" },
        { "UserId", userName },
        { "UserName", userName },
        { "PaymentProvider", "stripe" },
        { "GameId", "game-legacy" },
        { "GameName", "Legacy Game" },
        { "IsPaid", true },
        { "IsFulfilled", false },
        { "OrderDate", DateTime.UtcNow },
        { "CreatedAt", DateTime.UtcNow },
        { "Status", "PAID" },
        { "Currency", "USD" },
        { "Totals", new BsonDocument { { "Subtotal", 10m }, { "DiscountTotal", 0m }, { "TaxTotal", 0m }, { "Total", 10m } } },
        { "Events", new BsonArray() },
        {
            "Items", new BsonArray
            {
                new BsonDocument
                {
                    // актуальная форма
                    { "ItemId", "item-1" }, { "ProductType", "Game" }, { "GameId", "game-legacy" },
                    { "Title", "Legacy Game" }, { "CoverUrl", "" }, { "Slug", BsonNull.Value },
                    { "Platform", BsonNull.Value }, { "Region", BsonNull.Value }, { "Quantity", 1 },
                    { "UnitPrice", 10m }, { "UnitDiscount", 0m }, { "FinalUnitPrice", 10m }, { "LineTotal", 10m },
                    { "Pricing", new BsonDocument { { "PriceSource", "catalog" } } },
                    { "Delivery", new BsonDocument { { "DeliveryType", "Key" }, { "Keys", new BsonArray() } } },
                    // legacy-дубли — ровно те, что лежат в проде
                    { "TitleSnapshot", "Legacy Game" }, { "CoverUrlSnapshot", "" },
                    { "PlatformSnapshot", BsonNull.Value }, { "RegionSnapshot", BsonNull.Value }, { "Qty", 1 },
                    { "UnitPriceSnapshot", 10m }, { "UnitPriceCurrency", "USD" }, { "DiscountSnapshot", 0m },
                    { "FinalUnitPriceSnapshot", 10m }, { "LineTotalSnapshot", 10m }, { "DeliveryType", "Key" }
                }
            }
        }
    };

    [Fact]
    public async Task Legacy_order_document_is_readable_by_the_repository()
    {
        var orderId = Guid.NewGuid().ToString("N");
        var user = $"legacy-{orderId[..8]}@taleshop.test";

        using var scope = _factory.Services.CreateScope();
        var database = scope.ServiceProvider.GetRequiredService<IMongoDatabase>();
        await database.GetCollection<BsonDocument>("Orders").InsertOneAsync(LegacyOrder(orderId, user));

        // Читаем через тот же репозиторий, что и /api/account/orders — без атрибута тут летел
        // FormatException «Element 'TitleSnapshot' does not match any field».
        var repository = scope.ServiceProvider.GetRequiredService<IOrderRepository>();
        var orders = await repository.GetOrdersByUserAsync(user);

        var order = Assert.Single(orders);
        var item = Assert.Single(order.Items);
        Assert.Equal("Legacy Game", item.Title);
        Assert.Equal(1, item.Quantity);
        Assert.Equal(10m, item.UnitPrice);
    }

    [Fact]
    public async Task Initializer_strips_legacy_duplicates_and_keeps_the_actual_values()
    {
        var orderId = Guid.NewGuid().ToString("N");
        var user = $"legacy-{orderId[..8]}@taleshop.test";

        using var scope = _factory.Services.CreateScope();
        var database = scope.ServiceProvider.GetRequiredService<IMongoDatabase>();
        var raw = database.GetCollection<BsonDocument>("Orders");
        await raw.InsertOneAsync(LegacyOrder(orderId, user));

        await scope.ServiceProvider.GetRequiredService<MongoDbInitializer>().InitializeAsync();

        var stored = await raw.Find(Builders<BsonDocument>.Filter.Eq("OrderId", orderId)).SingleAsync();
        var item = stored["Items"].AsBsonArray[0].AsBsonDocument;

        Assert.False(item.Contains("TitleSnapshot"));
        Assert.False(item.Contains("Qty"));
        Assert.False(item.Contains("UnitPriceSnapshot"));
        Assert.False(item.Contains("DeliveryType"));
        // Актуальные значения на месте — миграция ничего не переписывала, только убирала дубли.
        Assert.Equal("Legacy Game", item["Title"].AsString);
        Assert.Equal(1, item["Quantity"].AsInt32);
        Assert.Equal("Key", item["Delivery"]["DeliveryType"].AsString);
    }

    [Fact]
    public async Task Initializer_leaves_a_document_alone_when_only_the_legacy_copy_has_the_value()
    {
        var orderId = Guid.NewGuid().ToString("N");
        var user = $"legacy-{orderId[..8]}@taleshop.test";

        using var scope = _factory.Services.CreateScope();
        var database = scope.ServiceProvider.GetRequiredService<IMongoDatabase>();
        var raw = database.GetCollection<BsonDocument>("Orders");

        var doc = LegacyOrder(orderId, user);
        doc["Items"].AsBsonArray[0]["Title"] = ""; // актуальное поле пустое, дубль заполнен
        await raw.InsertOneAsync(doc);

        await scope.ServiceProvider.GetRequiredService<MongoDbInitializer>().InitializeAsync();

        // Такой документ миграция не трогает и называет в логе — тут решает человек, не скрипт.
        var stored = await raw.Find(Builders<BsonDocument>.Filter.Eq("OrderId", orderId)).SingleAsync();
        Assert.True(stored["Items"].AsBsonArray[0].AsBsonDocument.Contains("TitleSnapshot"));
    }
}
