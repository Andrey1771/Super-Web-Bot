using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Cashback;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Services;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Возврат по позиции против выдачи ключей и кэшбэка. Ревью 2026-09-17 нашло, что возвращённая строка всё ещё
/// ждала ключ (добор со склада и «Deliver keys» выдавали его после возврата денег), а частично возвращённый заказ
/// не начислял кэшбэк за то, что покупатель оставил. Здесь же: состояние возврата пишется до Stripe и откатывается
/// при его отказе, наличие ПО считается по подходящим лицензиям, замки кассы не растут по числу гостей.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class RefundsAndFulfillmentTests
{
    private readonly TaleShopApiFactory _factory;

    public RefundsAndFulfillmentTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient Admin()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "agent@taleshop.test");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        return client;
    }

    private static async Task<JsonElement> Body(HttpResponseMessage response) =>
        JsonSerializer.Deserialize<JsonElement>(await response.Content.ReadAsStringAsync());

    /// <summary>Оплаченный картой заказ на две игры по $20, ключи ещё не выданы (AWAITING_KEYS).</summary>
    private async Task<(Order Order, string GameA, string GameB)> SeedAwaitingOrderAsync(decimal cashbackApplied = 0m)
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var orders = scope.ServiceProvider.GetRequiredService<IOrderRepository>();

        async Task<string> SeedAsync(string prefix)
        {
            var title = $"{prefix} {Guid.NewGuid():N}";
            await games.CreateAsync(new Game { Name = title, Title = title, Price = 20m, ImagePath = "cover.png" });
            return (await games.GetAllAsync()).First(game => game.Name == title).Id!;
        }
        var gameA = await SeedAsync("Kept");
        var gameB = await SeedAsync("Refunded");

        var email = $"buyer-{Guid.NewGuid():N}@taleshop.test";
        var card = 40m - cashbackApplied;
        var order = new Order
        {
            Id = Guid.NewGuid(),
            OrderNumber = $"TS-RF-{Guid.NewGuid():N}"[..14],
            UserId = email,
            UserName = email,
            PaymentProvider = "stripe",
            PaymentIntentId = $"pi_rf_{Guid.NewGuid():N}",
            IsPaid = true,
            IsFulfilled = false,
            OrderDate = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            PaidAt = DateTime.UtcNow,
            Status = "AWAITING_KEYS",
            PaymentStatus = "PAID",
            FulfillmentStatus = "PENDING_KEYS",
            Currency = "USD",
            TotalAmount = card,
            CashbackApplied = cashbackApplied,
            Totals = new MoneyTotals { Subtotal = 40m, Total = card },
            Items = new List<OrderItemSnapshot>
            {
                new() { GameId = gameA, Title = "Kept", Quantity = 1, UnitPrice = 20m, FinalUnitPrice = 20m, LineTotal = 20m, Delivery = new DeliverySnapshot { DeliveryType = "Key" } },
                new() { GameId = gameB, Title = "Refunded", Quantity = 1, UnitPrice = 20m, FinalUnitPrice = 20m, LineTotal = 20m, Delivery = new DeliverySnapshot { DeliveryType = "Key" } }
            }
        };
        await orders.CreateOrderAsync(order);
        return (order, gameA, gameB);
    }

    private async Task<Order> ReloadAsync(Guid id)
    {
        using var scope = _factory.Services.CreateScope();
        return (await scope.ServiceProvider.GetRequiredService<IOrderRepository>().GetOrderByIdAsync(id.ToString()))!;
    }

    private async Task StockAsync(string gameId, string key)
    {
        using var scope = _factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<IGameKeyRepository>().AddPoolKeysAsync(gameId, "Steam", new[] { key });
    }

    private async Task BackfillAsync(string gameId)
    {
        using var scope = _factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<IKeyFulfillmentService>().BackfillGameAsync(gameId);
    }

    private static string NewKey() => $"RF-{Guid.NewGuid():N}"[..20].ToUpperInvariant();

    // ---------- возвращённые строки не выдаются ----------

    [Fact]
    public async Task Refunded_item_gets_no_key_from_backfill_or_manual_delivery()
    {
        var (order, gameA, gameB) = await SeedAwaitingOrderAsync();
        var refundedItemId = order.Items[1].ItemId;
        await Admin().PostAsJsonAsync($"/api/admin/orders/{order.Id}/items/{refundedItemId}/refund", new { quantity = 1, reason = "Out of stock for weeks" });

        // Ключи для возвращённой игры завезли — добор со склада проходит мимо этого заказа.
        await StockAsync(gameB, NewKey());
        await BackfillAsync(gameB);
        var afterBackfill = await ReloadAsync(order.Id);
        Assert.Empty(afterBackfill.Items[1].Delivery!.Keys);
        Assert.Equal("AWAITING_KEYS", afterBackfill.Status);          // оставшаяся игра всё ещё ждёт свой ключ

        // Ручная выдача тоже не трогает возвращённую строку: со склада есть только её ключ — выдавать нечего.
        var nothing = await Admin().PostAsync($"/api/admin/orders/{order.Id}/deliver-keys", null);
        Assert.Equal(HttpStatusCode.Conflict, nothing.StatusCode);
        Assert.Empty((await ReloadAsync(order.Id)).Items[1].Delivery!.Keys);

        // Завезли оставшуюся игру — ручная выдача закрывает заказ одним ключом: возвращённая строка ключей больше не ждёт.
        await StockAsync(gameA, NewKey());
        var deliver = await Admin().PostAsync($"/api/admin/orders/{order.Id}/deliver-keys", null);
        Assert.Equal(HttpStatusCode.OK, deliver.StatusCode);
        var done = await ReloadAsync(order.Id);
        Assert.Single(done.Items[0].Delivery!.Keys);
        Assert.Empty(done.Items[1].Delivery!.Keys);
        Assert.True(done.IsFulfilled);
        Assert.Equal("DELIVERED", done.Status);
        Assert.Equal("PARTIALLY_REFUNDED", done.PaymentStatus);
    }

    [Fact]
    public async Task Fully_refunded_order_is_never_backfilled()
    {
        var (order, gameA, _) = await SeedAwaitingOrderAsync();
        await Admin().PostAsJsonAsync($"/api/admin/orders/{order.Id}/refund", new { reason = "Customer changed their mind" });
        Assert.Equal("REFUNDED", (await ReloadAsync(order.Id)).Status);

        await StockAsync(gameA, NewKey());
        await BackfillAsync(gameA);

        var after = await ReloadAsync(order.Id);
        Assert.All(after.Items, item => Assert.Empty(item.Delivery!.Keys));
        Assert.Equal("REFUNDED", after.Status);
    }

    // ---------- кэшбэк за оставшееся ----------

    [Fact]
    public async Task Partially_refunded_order_still_earns_cashback_for_the_kept_item()
    {
        var (order, gameA, _) = await SeedAwaitingOrderAsync();
        await StockAsync(gameA, NewKey());
        await Admin().PostAsJsonAsync($"/api/admin/orders/{order.Id}/items/{order.Items[1].ItemId}/refund", new { quantity = 1, reason = "Never restocked" });

        // Возврат сам довыдал оставшуюся игру (ключ уже на складе) и закрыл заказ.
        var done = await ReloadAsync(order.Id);
        Assert.True(done.IsFulfilled);
        Assert.Single(done.Items[0].Delivery!.Keys);

        using var scope = _factory.Services.CreateScope();
        var summary = await scope.ServiceProvider.GetRequiredService<ICashbackLedger>().GetSummaryAsync(order.UserId);
        // 3% с $40 начислено, половина (возвращённая игра) сразу забрана: остаётся 3% с оставленных $20.
        Assert.Equal(0.60m, summary.PendingUsd);
        Assert.Equal(0.60m, summary.EarnedAllTimeUsd);
    }

    // ---------- состояние возврата до Stripe ----------

    [Fact]
    public async Task Item_refund_is_recorded_before_stripe_and_rolled_back_when_stripe_refuses()
    {
        var (order, _, _) = await SeedAwaitingOrderAsync();
        var itemId = order.Items[1].ItemId;

        _factory.Stripe.FailRefunds = true;
        try
        {
            var refused = await Admin().PostAsJsonAsync($"/api/admin/orders/{order.Id}/items/{itemId}/refund", new { quantity = 1, reason = "test" });
            Assert.Equal(HttpStatusCode.BadGateway, refused.StatusCode);
        }
        finally
        {
            _factory.Stripe.FailRefunds = false;
        }

        var rolledBack = await ReloadAsync(order.Id);
        Assert.Equal(0, rolledBack.Items[1].RefundedQuantity);
        Assert.Null(rolledBack.RefundedShare);
        Assert.Null(rolledBack.RefundedAmount);
        Assert.Equal("PAID", rolledBack.PaymentStatus);
        Assert.Contains(rolledBack.Events, e => e.Type == "refund_failed");
        Assert.DoesNotContain(rolledBack.Events, e => e.Type == "refund_pending" || e.Type == "refund");

        var ok = await Admin().PostAsJsonAsync($"/api/admin/orders/{order.Id}/items/{itemId}/refund", new { quantity = 1, reason = "test" });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        var refunded = await ReloadAsync(order.Id);
        Assert.Equal(1, refunded.Items[1].RefundedQuantity);
        Assert.Equal(20m, refunded.RefundedAmount);
        Assert.Contains(refunded.Events, e => e.Type == "refund");
        Assert.DoesNotContain(refunded.Events, e => e.Type == "refund_pending");

        // Ключ идемпотентности несёт сумму: тот же возврат с другой суммой (после других возвратов) не упрётся в чужой ключ.
        var call = Assert.Single(_factory.Stripe.Refunds, r => r.PaymentIntentId == order.PaymentIntentId);
        Assert.EndsWith($"_{itemId}_1_2000", call.IdempotencyKey);
        Assert.Equal(2000, call.AmountMinor);
    }

    // ---------- наличие ПО по подходящим лицензиям ----------

    private static CatalogItem SoftwareItem(params CatalogLicense[] licenses) => new(
        Id: "soft", Slug: "soft", Name: "Soft", Title: "Soft", Description: "", GameType: default, Category: "Utilities",
        ImagePath: "", CoverMediaId: null, ReleaseDate: DateTime.UtcNow, IsComingSoon: false, Price: 10m, FinalPrice: 10m,
        Currency: "USD", Prices: new Dictionary<string, decimal>(), DiscountPercent: null, DiscountActive: false, DiscountEndsAt: null,
        Genres: Array.Empty<string>(), Platforms: Array.Empty<string>(), Rating: null, ReviewCount: 0, InStock: true, LowStockLeft: null,
        KeysAvailable: 0, KeysDelivered: 0, LowStockThreshold: null, ShowInFeaturedStorefront: false, FeaturedStorefrontPriority: 0,
        Kind: ProductKind.Software, Licenses: licenses);

    private static CatalogLicense License(string code, int? months, decimal price, bool inStock) => new(
        Code: code, Title: code, Label: null, TermMonths: months, Devices: 1, IsSubscription: false, IsDefault: false,
        Price: price, FinalPrice: price, Prices: new Dictionary<string, decimal>(), DiscountPercent: null, OwnDiscount: false,
        DiscountEndsAt: null, InStock: inStock);

    [Fact]
    public void Software_stock_follows_the_license_whose_price_is_shown()
    {
        var item = SoftwareItem(License("y1", 12, 10m, inStock: false), License("life", null, 30m, inStock: true));

        // Фильтр «на год»: годовая распродана — карточка с её ценой не должна считаться «в наличии» из-за бессрочной.
        var yearly = SoftwareLicenses.Represent(item, license => license.TermMonths == 12);
        Assert.Equal("y1", yearly.LicenseCode);
        Assert.False(yearly.InStock);

        // Без фильтра лучшая лицензия — та, что в наличии.
        var any = SoftwareLicenses.Represent(item);
        Assert.Equal("life", any.LicenseCode);
        Assert.True(any.InStock);
    }

    // ---------- замки кассы ----------

    [Fact]
    public async Task Checkout_locks_serialise_one_customer_and_do_not_grow_with_guests()
    {
        // Полос фиксированное число: миллион разных гостевых почт не оставляет по семафору на каждую.
        for (var i = 0; i < 5000; i++)
        {
            using var _ = await CheckoutLocks.AcquireAsync($"guest-{i}@example.com");
        }
        Assert.InRange(CheckoutLocks.StripeOf("someone@example.com"), 0, CheckoutLocks.Stripes - 1);
        Assert.Equal(CheckoutLocks.StripeOf("Buyer@Example.com"), CheckoutLocks.StripeOf("buyer@example.com"));

        // Один покупатель — по очереди: второй захват ждёт, пока первый не отпустит.
        var first = await CheckoutLocks.AcquireAsync("same@example.com");
        var second = CheckoutLocks.AcquireAsync("same@example.com");
        Assert.False(second.IsCompleted);
        first.Dispose();
        using var released = await second.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.NotNull(released);
    }
}
