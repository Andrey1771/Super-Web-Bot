using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Действия специалиста над заказом. Главное, что здесь сторожится: статус меняется только
/// как следствие реального действия — возврат ставит REFUNDED после ответа Stripe, выдача
/// ставит DELIVERED после того, как ключ ушёл, а из «не того» состояния действие отказывает
/// с 409 и ничего не трогает.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class AdminOrderActionsTests
{
    private readonly TaleShopApiFactory _factory;

    public AdminOrderActionsTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient Admin()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "agent@taleshop.test");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        return client;
    }

    private async Task<(Order order, string gameId)> SeedAsync(string status, bool paid, bool delivered, string? paymentIntent = "pi_test_" + "x")
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var orders = scope.ServiceProvider.GetRequiredService<IOrderRepository>();
        var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();

        // Id задаём сами: CreateAsync не пишет его обратно в сущность, а без него позиция заказа и
        // ключ пула получают GameId=null и все тесты сталкиваются на уникальном индексе ключей.
        // Название уникальное: инициализатор строит по нему slug с уникальным индексом, и одинаковые
        // названия из разных тестов сталкивались бы там.
        var title = $"Actions Game {Guid.NewGuid():N}"[..24];
        var game = new Game { Id = MongoDB.Bson.ObjectId.GenerateNewId().ToString(), Name = title, Title = title, Price = 10m, Currency = "USD" };
        await games.CreateAsync(game);

        var email = $"buyer-{Guid.NewGuid():N}@taleshop.test";
        var order = new Order
        {
            Id = Guid.NewGuid(),
            OrderNumber = $"TS-ACT-{Guid.NewGuid():N}"[..14],
            UserId = email,
            UserName = email,
            GameId = game.Id!,
            GameName = game.Title,
            PaymentProvider = "stripe",
            PaymentIntentId = paymentIntent is null ? null : paymentIntent + Guid.NewGuid().ToString("N")[..6],
            IsPaid = paid,
            IsFulfilled = delivered,
            OrderDate = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            Status = status,
            PaymentStatus = paid ? "PAID" : "UNPAID",
            Currency = "USD",
            TotalAmount = 10m,
            Totals = new MoneyTotals { Subtotal = 10m, Total = 10m },
            Items = new List<OrderItemSnapshot>
            {
                new() { GameId = game.Id!, Title = game.Title, Quantity = 1, UnitPrice = 10m, FinalUnitPrice = 10m, LineTotal = 10m,
                        Delivery = new DeliverySnapshot { DeliveryType = "Key" } }
            }
        };

        if (delivered)
        {
            // Выданный ключ: plaintext у клиента в коллекции ключей, в заказе — маска.
            const string plain = "AAAA-BBBB-CCCC-DDDD";
            await keys.AddAsync(new GameKey { UserId = email, GameId = game.Id!, Key = plain, KeyType = "steam", IssuedAt = DateTime.UtcNow, IsActive = true });
            order.Items[0].Delivery!.Keys.Add(new DeliveredKey { KeyMasked = new string('•', plain.Length - 4) + plain[^4..], DeliveredAt = DateTime.UtcNow });
            order.FulfillmentStatus = "DELIVERED";
        }

        await orders.CreateOrderAsync(order);
        return (order, game.Id!);
    }

    private static async Task<JsonElement> Body(HttpResponseMessage response) =>
        JsonSerializer.Deserialize<JsonElement>(await response.Content.ReadAsStringAsync());

    // ---------- resend ----------

    [Fact]
    public async Task Resend_keys_emails_the_delivered_key_again()
    {
        var (order, _) = await SeedAsync("DELIVERED", paid: true, delivered: true);
        _factory.Mail.Clear();

        var response = await Admin().PostAsync($"/api/admin/orders/{order.Id}/resend-keys", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var mail = Assert.Single(_factory.Mail.Sent, m => m.To == order.UserId);
        Assert.Contains("AAAA-BBBB-CCCC-DDDD", mail.TextBody);

        var body = await Body(response);
        var events = body.GetProperty("order").GetProperty("events").EnumerateArray().ToList();
        var resent = Assert.Single(events, e => e.GetProperty("type").GetString() == "keys_resent");
        Assert.Equal("agent@taleshop.test", resent.GetProperty("actor").GetString());
    }

    [Fact]
    public async Task Resend_keys_refuses_when_nothing_was_delivered()
    {
        var (order, _) = await SeedAsync("AWAITING_KEYS", paid: true, delivered: false);
        var response = await Admin().PostAsync($"/api/admin/orders/{order.Id}/resend-keys", null);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    // ---------- deliver ----------

    [Fact]
    public async Task Deliver_keys_takes_a_key_from_the_pool_and_completes_the_order()
    {
        var (order, gameId) = await SeedAsync("AWAITING_KEYS", paid: true, delivered: false);
        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<IGameKeyRepository>()
                .AddPoolKeysAsync(gameId, "steam", new[] { "POOL-KEY-0001-XXXX" });
        }
        _factory.Mail.Clear();

        var response = await Admin().PostAsync($"/api/admin/orders/{order.Id}/deliver-keys", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var mapped = (await Body(response)).GetProperty("order");
        Assert.Equal("DELIVERED", mapped.GetProperty("status").GetString());
        Assert.Equal(1, mapped.GetProperty("items")[0].GetProperty("keysDelivered").GetInt32());
        Assert.Contains(_factory.Mail.Sent, m => m.To == order.UserId && m.TextBody.Contains("POOL-KEY-0001-XXXX"));
    }

    [Fact]
    public async Task Deliver_keys_refuses_when_pool_is_empty_and_leaves_status_alone()
    {
        var (order, _) = await SeedAsync("AWAITING_KEYS", paid: true, delivered: false);
        var response = await Admin().PostAsync($"/api/admin/orders/{order.Id}/deliver-keys", null);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("AWAITING_KEYS", (await Body(response)).GetProperty("order").GetProperty("status").GetString());
    }

    [Fact]
    public async Task Deliver_keys_refuses_on_unpaid_order()
    {
        var (order, _) = await SeedAsync("PENDING", paid: false, delivered: false);
        var response = await Admin().PostAsync($"/api/admin/orders/{order.Id}/deliver-keys", null);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    // ---------- refund ----------

    [Fact]
    public async Task Refund_calls_stripe_with_a_deterministic_key_and_marks_the_order()
    {
        var (order, _) = await SeedAsync("DELIVERED", paid: true, delivered: true);

        var response = await Admin().PostAsJsonAsync($"/api/admin/orders/{order.Id}/refund", new { reason = "Customer changed mind" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        Assert.True(_factory.Stripe.RefundedIntents.TryGetValue(order.PaymentIntentId!, out var idem));
        Assert.Equal($"admin_refund_{order.Id:N}", idem);

        var mapped = (await Body(response)).GetProperty("order");
        Assert.Equal("REFUNDED", mapped.GetProperty("status").GetString());
        Assert.Equal("REFUNDED", mapped.GetProperty("paymentStatus").GetString());
        var refund = mapped.GetProperty("events").EnumerateArray().Single(e => e.GetProperty("type").GetString() == "refund");
        Assert.Contains("Customer changed mind", refund.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Refund_requires_a_reason()
    {
        var (order, _) = await SeedAsync("DELIVERED", paid: true, delivered: true);
        var response = await Admin().PostAsJsonAsync($"/api/admin/orders/{order.Id}/refund", new { reason = "" });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.False(_factory.Stripe.RefundedIntents.ContainsKey(order.PaymentIntentId!));
    }

    [Fact]
    public async Task Refund_refuses_non_stripe_orders_but_mark_refunded_works()
    {
        var (order, _) = await SeedAsync("DELIVERED", paid: true, delivered: false, paymentIntent: null);
        using (var scope = _factory.Services.CreateScope())
        {
            var repo = scope.ServiceProvider.GetRequiredService<IOrderRepository>();
            var stored = await repo.GetOrderByIdAsync(order.Id.ToString());
            stored!.PaymentProvider = "telegram_stars";
            await repo.UpdateOrderAsync(stored);
        }

        var admin = Admin();
        var refund = await admin.PostAsJsonAsync($"/api/admin/orders/{order.Id}/refund", new { reason = "x" });
        Assert.Equal(HttpStatusCode.Conflict, refund.StatusCode);

        var marked = await admin.PostAsJsonAsync($"/api/admin/orders/{order.Id}/mark-refunded", new { reason = "Refunded via Telegram Stars in BotFather" });
        Assert.Equal(HttpStatusCode.OK, marked.StatusCode);
        Assert.Equal("REFUNDED", (await Body(marked)).GetProperty("order").GetProperty("status").GetString());
    }

    // ---------- cancel / force ----------

    [Fact]
    public async Task Cancel_works_for_unpaid_and_refuses_paid()
    {
        var admin = Admin();
        var (unpaid, _) = await SeedAsync("PENDING", paid: false, delivered: false);
        var ok = await admin.PostAsJsonAsync($"/api/admin/orders/{unpaid.Id}/cancel", new { reason = "Duplicate" });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.Equal("CANCELLED", (await Body(ok)).GetProperty("order").GetProperty("status").GetString());

        var (paid, _) = await SeedAsync("PAID", paid: true, delivered: false);
        var refused = await admin.PostAsJsonAsync($"/api/admin/orders/{paid.Id}/cancel", new { reason = "x" });
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
    }

    [Fact]
    public async Task Force_status_needs_a_reason_and_records_who_did_it()
    {
        var (order, _) = await SeedAsync("PAID", paid: true, delivered: false);
        var admin = Admin();

        var noReason = await admin.PostAsJsonAsync($"/api/admin/orders/{order.Id}/force-status", new { status = "DELIVERED" });
        Assert.Equal(HttpStatusCode.Conflict, noReason.StatusCode);

        var forced = await admin.PostAsJsonAsync($"/api/admin/orders/{order.Id}/force-status", new { status = "DELIVERED", reason = "Key handed over in chat" });
        Assert.Equal(HttpStatusCode.OK, forced.StatusCode);
        var events = (await Body(forced)).GetProperty("order").GetProperty("events").EnumerateArray().ToList();
        var e = Assert.Single(events, x => x.GetProperty("type").GetString() == "status_forced");
        Assert.Contains("PAID → DELIVERED", e.GetProperty("message").GetString());
        Assert.Equal("agent@taleshop.test", e.GetProperty("actor").GetString());
    }

    // ---------- list / export ----------

    [Fact]
    public async Task List_shows_order_number_and_all_items()
    {
        var (order, _) = await SeedAsync("DELIVERED", paid: true, delivered: true);
        var response = await Admin().GetAsync($"/api/admin/orders/{order.Id}");
        var mapped = await Body(response);
        Assert.Equal(order.OrderNumber, mapped.GetProperty("number").GetString());
        Assert.StartsWith("Actions Game", mapped.GetProperty("items")[0].GetProperty("title").GetString());
        Assert.Equal("SENT", mapped.GetProperty("items")[0].GetProperty("keyDeliveryStatus").GetString());
    }

    [Fact]
    public async Task Export_returns_csv_for_the_whole_filter()
    {
        var (order, _) = await SeedAsync("DELIVERED", paid: true, delivered: false);
        var response = await Admin().GetAsync($"/api/admin/orders/export?search={Uri.EscapeDataString(order.UserId)}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.StartsWith("text/csv", response.Content.Headers.ContentType?.MediaType);
        var csv = await response.Content.ReadAsStringAsync();
        Assert.Contains(order.OrderNumber!, csv);
        Assert.Contains("Actions Game", csv);
    }
}
