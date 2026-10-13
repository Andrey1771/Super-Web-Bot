using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Regions;
using SuperBot.Infrastructure.Services;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Региональные варианты ключа насквозь: покупатель выбрал «европейский за 15», и ровно столько
/// с него берут на кассе, а выдача даёт ключ именно из европейской партии. Это главная честность
/// этой механики — заплатить за один вариант, а получить другой покупатель не должен.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class RegionOfferPricingTests
{
    private readonly TaleShopApiFactory _factory;

    public RegionOfferPricingTests(TaleShopApiFactory factory) => _factory = factory;

    private static readonly RegionPolicy EuOnly = new() { Mode = "Regions", Regions = new() { "EU" } };

    /// <summary>Игра за 20 с европейской партией по 15 — как её завёл бы магазин в админке.</summary>
    private async Task<string> SeedGameWithEuOfferAsync(decimal euPrice = 15m)
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var slug = $"ro-{Guid.NewGuid():N}"[..20];
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
            RegionPrices = new List<RegionPrice> { new() { OfferKey = RegionOffer.KeyOf(EuOnly), Price = euPrice } }
        });
        return id;
    }

    [Fact]
    public async Task Checkout_charges_the_price_of_the_chosen_region_not_the_game_price()
    {
        var gameId = await SeedGameWithEuOfferAsync();
        using var scope = _factory.Services.CreateScope();
        var pricing = scope.ServiceProvider.GetRequiredService<ICheckoutPricingService>();

        var europe = await pricing.PriceAsync(new CheckoutPricingRequest
        {
            Items = new() { new() { GameId = gameId, Quantity = 1, OfferKey = RegionOffer.KeyOf(EuOnly) } },
            UserName = "u",
            BuyerCountry = "DE"
        });
        Assert.True(europe.Success, europe.Error);
        Assert.Equal(15m, europe.Total);
        Assert.Equal("Europe", europe.Items.Single().OfferTitle);
        Assert.Equal("r:EU", europe.Items.Single().OfferKey);

        // Без варианта — прежняя цена игры: механика ничего не ломает там, где вариантов нет.
        var plain = await pricing.PriceAsync(new CheckoutPricingRequest
        {
            Items = new() { new() { GameId = gameId, Quantity = 1 } },
            UserName = "u",
            BuyerCountry = "DE"
        });
        Assert.True(plain.Success, plain.Error);
        Assert.Equal(20m, plain.Total);
        Assert.Null(plain.Items.Single().OfferKey);
    }

    [Fact]
    public async Task Checkout_keeps_the_regions_of_one_game_as_separate_lines()
    {
        var gameId = await SeedGameWithEuOfferAsync();
        using var scope = _factory.Services.CreateScope();
        var pricing = scope.ServiceProvider.GetRequiredService<ICheckoutPricingService>();

        var order = await pricing.PriceAsync(new CheckoutPricingRequest
        {
            Items = new()
            {
                new() { GameId = gameId, Quantity = 1, OfferKey = RegionOffer.KeyOf(EuOnly) },
                new() { GameId = gameId, Quantity = 1, OfferKey = "global" }
            },
            UserName = "u",
            BuyerCountry = "DE"
        });

        Assert.True(order.Success, order.Error);
        Assert.Equal(2, order.Items.Count);
        // Европейский по своей цене, глобальный — по цене игры; складываются, а не схлопываются.
        Assert.Equal(35m, order.Total);
    }

    [Fact]
    public async Task Checkout_refuses_a_region_the_buyer_cannot_activate_and_a_forged_key()
    {
        var gameId = await SeedGameWithEuOfferAsync();
        using var scope = _factory.Services.CreateScope();
        var pricing = scope.ServiceProvider.GetRequiredService<ICheckoutPricingService>();

        // Американец выбрал европейский вариант — ключ у него не заработает.
        var blocked = await pricing.PriceAsync(new CheckoutPricingRequest
        {
            Items = new() { new() { GameId = gameId, Quantity = 1, OfferKey = RegionOffer.KeyOf(EuOnly) } },
            UserName = "u",
            BuyerCountry = "US"
        });
        Assert.False(blocked.Success);
        Assert.Contains("US", blocked.Error);

        // Ключ варианта пришёл от клиента: неразбираемый — отказ, а не тихая продажа «чего-нибудь».
        var forged = await pricing.PriceAsync(new CheckoutPricingRequest
        {
            Items = new() { new() { GameId = gameId, Quantity = 1, OfferKey = "r:" } },
            UserName = "u",
            BuyerCountry = "DE"
        });
        Assert.False(forged.Success);
    }

    [Fact]
    public async Task Keys_are_dispensed_from_the_region_the_buyer_paid_for()
    {
        var gameId = await SeedGameWithEuOfferAsync();
        using var scope = _factory.Services.CreateScope();
        var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();

        await keys.AddPoolKeysAsync(gameId, "Steam", new[] { "OFFEU-0001-AAAA" }, regionPolicy: EuOnly);
        await keys.AddPoolKeysAsync(gameId, "Steam", new[] { "OFFGL-0001-AAAA" }, regionPolicy: RegionPolicy.Anywhere());

        // Заплатил за европейский — получает европейский, хотя глобальный тоже подходит немцу.
        var europe = await keys.TryDispensePoolKeyAsync(gameId, "de-buyer", null, null, "DE", null, RegionOffer.KeyOf(EuOnly));
        Assert.StartsWith("OFFEU-", europe.Key);

        // Заплатил за глобальный — европейский ему не отдают, даже когда он единственный свободный.
        var global = await keys.TryDispensePoolKeyAsync(gameId, "de-buyer-2", null, null, "DE", null, "global");
        Assert.StartsWith("OFFGL-", global.Key);

        // Партия кончилась: заказ ждёт пополнения, а не получает ключ другого варианта.
        await keys.AddPoolKeysAsync(gameId, "Steam", new[] { "OFFGL-0002-AAAA" }, regionPolicy: RegionPolicy.Anywhere());
        Assert.Null(await keys.TryDispensePoolKeyAsync(gameId, "de-buyer-3", null, null, "DE", null, RegionOffer.KeyOf(EuOnly)));
    }

    [Fact]
    public async Task Paid_order_receives_the_key_of_its_region_and_the_buyer_is_told_which_one()
    {
        var gameId = await SeedGameWithEuOfferAsync();
        using var scope = _factory.Services.CreateScope();
        var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();
        var orders = scope.ServiceProvider.GetRequiredService<IOrderRepository>();
        var fulfillment = scope.ServiceProvider.GetRequiredService<IKeyFulfillmentService>();

        await keys.AddPoolKeysAsync(gameId, "Steam", new[] { "ORDGL-0001-AAAA" }, regionPolicy: RegionPolicy.Anywhere());
        await keys.AddPoolKeysAsync(gameId, "Steam", new[] { "ORDEU-0001-AAAA" }, regionPolicy: EuOnly);

        var email = $"offer-{Guid.NewGuid():N}"[..18] + "@example.com";
        var order = new Order
        {
            Id = Guid.NewGuid(),
            OrderNumber = $"TS-OFF-{Guid.NewGuid():N}"[..14],
            UserId = email,
            UserName = email,
            IsPaid = true,
            PaymentStatus = "PAID",
            Status = "PAID",
            Currency = "USD",
            OrderDate = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            BuyerCountry = "DE",
            TotalAmount = 15m,
            Totals = new MoneyTotals { Subtotal = 15m, Total = 15m },
            Items = new List<OrderItemSnapshot>
            {
                new()
                {
                    GameId = gameId,
                    Title = "Region offer game",
                    OfferKey = RegionOffer.KeyOf(EuOnly),
                    OfferTitle = "Europe",
                    Quantity = 1,
                    UnitPrice = 15m,
                    FinalUnitPrice = 15m,
                    LineTotal = 15m,
                    Delivery = new DeliverySnapshot { DeliveryType = "Key" }
                }
            }
        };
        await orders.CreateOrderAsync(order);

        var delivered = await fulfillment.FulfillOrderAsync(order);

        // Ключ — из европейской партии, хотя глобальный лежал первым и немцу тоже подошёл бы.
        var key = Assert.Single(delivered);
        Assert.StartsWith("ORDEU-", key.Key);
        // …и покупателю сказано, где он активируется: письмо и уведомление идут этим же текстом.
        Assert.Contains("(Europe)", key.GameTitle);
        Assert.True(order.IsFulfilled);
    }
}
