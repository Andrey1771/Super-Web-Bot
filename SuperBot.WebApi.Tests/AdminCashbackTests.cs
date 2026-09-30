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
/// Кэшбэк в панели: настройки программы применяются без рестарта, уровни проверяются на здравый смысл,
/// ручная правка баланса требует причины и видна в журнале, сводка долга и карточка заказа — на месте.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class AdminCashbackTests
{
    private readonly TaleShopApiFactory _factory;
    private readonly string _customer = $"cb-admin-{Guid.NewGuid():N}@taleshop.test";

    public AdminCashbackTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient Client(string roles = "admin")
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "owner@taleshop.test");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, roles);
        return client;
    }

    private static async Task<JsonElement> Body(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>();

    [Fact]
    public async Task Programme_settings_apply_without_restart_and_reset_to_config()
    {
        var admin = Client();
        try
        {
            var saved = await admin.PutAsJsonAsync("/api/admin/cashback/settings", new
            {
                pendingDays = 7,
                minCardPaymentUsd = 1m,
                expiryReminderDays = 10,
                tiers = new[]
                {
                    new { id = "bronze", name = "Bronze", percent = 2m, spendThresholdUsd = 0m, imageUrl = (string?)"/media/bronze.webp" },
                    new { id = "gold", name = "Gold", percent = 6m, spendThresholdUsd = 500m, imageUrl = (string?)null },
                }
            });
            Assert.Equal(HttpStatusCode.OK, saved.StatusCode);

            var program = await Body(await _factory.CreateClient().GetAsync("/api/cashback/program?currency=USD"));
            Assert.Equal(7, program.GetProperty("pendingDays").GetInt32());
            Assert.Equal(1m, program.GetProperty("minCardPayment").GetDecimal());
            Assert.Equal(new[] { "bronze", "gold" }, program.GetProperty("tiers").EnumerateArray().Select(t => t.GetProperty("id").GetString()));
            // Картинка уровня из админки доезжает до публичных условий — по ней рисуется трек на /rewards.
            Assert.Equal("/media/bronze.webp", program.GetProperty("tiers")[0].GetProperty("imageUrl").GetString());

            var cashback = await Body(await admin.GetAsync("/api/admin/cashback/settings"));
            Assert.Equal(10, cashback.GetProperty("expiryReminderDays").GetProperty("value").GetInt32());
            Assert.Equal(30, cashback.GetProperty("expiryReminderDays").GetProperty("defaultValue").GetInt32());
            Assert.True(cashback.GetProperty("pendingDays").GetProperty("overridden").GetBoolean());
            Assert.Equal(14, cashback.GetProperty("pendingDays").GetProperty("defaultValue").GetInt32());
            Assert.True(cashback.GetProperty("tiers").GetProperty("overridden").GetBoolean());
        }
        finally
        {
            await admin.PutAsJsonAsync("/api/admin/cashback/settings", new { });
        }

        var reset = await Body(await _factory.CreateClient().GetAsync("/api/cashback/program?currency=USD"));
        Assert.Equal(14, reset.GetProperty("pendingDays").GetInt32());
        Assert.Equal(4, reset.GetProperty("tiers").GetArrayLength());
    }

    [Theory]
    [InlineData(10, 3, 500, 5)]   // первый уровень не с нуля
    [InlineData(0, 5, 500, 3)]    // процент на уровне выше меньше
    [InlineData(0, 3, 0, 5)]      // одинаковые пороги
    public async Task Nonsensical_levels_are_rejected(decimal firstThreshold, decimal firstPercent, decimal secondThreshold, decimal secondPercent)
    {
        var response = await Client().PutAsJsonAsync("/api/admin/cashback/settings", new
        {
            tiers = new[]
            {
                new { id = "a", name = "A", percent = firstPercent, spendThresholdUsd = firstThreshold },
                new { id = "b", name = "B", percent = secondPercent, spendThresholdUsd = secondThreshold },
            }
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("data:image/png;base64,AAAA")]
    [InlineData("//evil.example/x.png")]
    public async Task Level_image_must_be_a_media_link(string imageUrl)
    {
        var response = await Client().PutAsJsonAsync("/api/admin/cashback/settings", new
        {
            tiers = new[] { new { id = "a", name = "A", percent = 3m, spendThresholdUsd = 0m, imageUrl } }
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Saving_site_settings_does_not_reset_cashback_settings()
    {
        var admin = Client();
        try
        {
            Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync("/api/admin/cashback/settings", new { pendingDays = 5 })).StatusCode);
            // Site settings сохраняются своим полным состоянием — кэшбэка в нём больше нет, и он не должен сброситься.
            Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync("/api/admin/site-settings", new { lowStockThreshold = 4 })).StatusCode);

            var cashback = await Body(await admin.GetAsync("/api/admin/cashback/settings"));
            Assert.Equal(5, cashback.GetProperty("pendingDays").GetProperty("value").GetInt32());
            Assert.False((await Body(await admin.GetAsync("/api/admin/site-settings"))).TryGetProperty("cashback", out _));
        }
        finally
        {
            await admin.PutAsJsonAsync("/api/admin/cashback/settings", new { });
            await admin.PutAsJsonAsync("/api/admin/site-settings", new { });
        }
    }

    [Fact]
    public async Task Customer_card_shows_cashback_emails_and_an_admin_can_resume_them()
    {
        using (var scope = _factory.Services.CreateScope())
        {
            var database = scope.ServiceProvider.GetRequiredService<MongoDB.Driver.IMongoDatabase>();
            await database.GetCollection<SuperBot.WebApi.Services.Cashback.CashbackNoticeDb>("CashbackNotices").InsertOneAsync(
                new SuperBot.WebApi.Services.Cashback.CashbackNoticeDb { Key = $"expiring:{Guid.NewGuid():N}", Email = _customer, SentAtUtc = DateTime.UtcNow });
            await database.GetCollection<SuperBot.WebApi.Services.Cashback.CashbackNoticeOptOutDb>("CashbackNoticeOptOuts").InsertOneAsync(
                new SuperBot.WebApi.Services.Cashback.CashbackNoticeOptOutDb { Email = _customer, CreatedAtUtc = DateTime.UtcNow });
        }

        var admin = Client();
        var emails = (await Body(await admin.GetAsync($"/api/admin/cashback/customers/{_customer}"))).GetProperty("emails");
        Assert.True(emails.GetProperty("optedOut").GetBoolean());
        Assert.Equal("expiring", emails.GetProperty("sent").EnumerateArray().Single().GetProperty("kind").GetString());

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync($"/api/admin/cashback/customers/{_customer}/emails/resume", new { reason = "" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync($"/api/admin/cashback/customers/{_customer}/emails/resume", new { reason = "Customer asked by email" })).StatusCode);
        var after = (await Body(await admin.GetAsync($"/api/admin/cashback/customers/{_customer}"))).GetProperty("emails");
        Assert.False(after.GetProperty("optedOut").GetBoolean());
    }

    [Fact]
    public async Task Manual_adjustment_needs_a_reason_and_shows_in_the_customer_history()
    {
        var admin = Client();

        var noReason = await admin.PostAsJsonAsync($"/api/admin/cashback/customers/{_customer}/adjust", new { amountUsd = 5m, reason = "" });
        Assert.Equal(HttpStatusCode.BadRequest, noReason.StatusCode);

        var added = await admin.PostAsJsonAsync($"/api/admin/cashback/customers/{_customer}/adjust", new { amountUsd = 5m, reason = "Won the dispute" });
        Assert.Equal(HttpStatusCode.OK, added.StatusCode);

        var card = await Body(await admin.GetAsync($"/api/admin/cashback/customers/{_customer}"));
        Assert.Equal(5m, card.GetProperty("availableUsd").GetDecimal());
        var entry = card.GetProperty("entries").EnumerateArray().Single();
        Assert.Equal("adjust", entry.GetProperty("type").GetString());
        Assert.Equal("Won the dispute", entry.GetProperty("note").GetString());
        Assert.Equal("owner@taleshop.test", entry.GetProperty("actor").GetString());

        var overview = await Body(await admin.GetAsync("/api/admin/cashback/overview"));
        Assert.True(overview.GetProperty("liabilityUsd").GetDecimal() >= 5m);

        var dashboard = await Body(await admin.GetAsync("/api/admin/dashboard"));
        Assert.True(dashboard.GetProperty("cashback").GetProperty("availableUsd").GetDecimal() >= 5m);
    }

    [Fact]
    public async Task Support_agents_cannot_touch_cashback()
    {
        var support = Client("support");
        Assert.Equal(HttpStatusCode.Forbidden, (await support.GetAsync($"/api/admin/cashback/customers/{_customer}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await support.PostAsJsonAsync($"/api/admin/cashback/customers/{_customer}/adjust", new { amountUsd = 5m, reason = "x" })).StatusCode);
    }

    [Fact]
    public async Task Admin_order_card_shows_the_part_paid_with_cashback()
    {
        var id = Guid.NewGuid();
        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<IOrderRepository>().CreateOrderAsync(new Order
            {
                Id = id,
                OrderGuid = id,
                OrderNumber = $"TS-CB-{Guid.NewGuid():N}"[..16],
                UserId = _customer,
                UserName = _customer,
                PaymentIntentId = $"pi_cb_admin_{Guid.NewGuid():N}",
                Currency = "USD",
                IsPaid = true,
                TotalAmount = 12m,
                Totals = new MoneyTotals { Subtotal = 15m, Total = 12m },
                CashbackApplied = 3m,
                CashbackUsd = 3m,
                OrderDate = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow
            });
        }

        var order = await Body(await Client().GetAsync($"/api/admin/orders/{id}"));
        Assert.Equal(3m, order.GetProperty("cashbackApplied").GetDecimal());
        Assert.Equal(12m, order.GetProperty("totalAmount").GetDecimal());
        Assert.Equal(JsonValueKind.Null, order.GetProperty("cashbackEarned").ValueKind);

        // Начисление за заказ видно прямо в карточке — в валюте заказа и с состоянием.
        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<SuperBot.Core.Cashback.ICashbackLedger>().EarnAsync(new SuperBot.Core.Cashback.CashbackEarnRequest
            {
                UserKey = _customer, OrderId = id.ToString(), OrderNumber = "TS-CB", GameTitle = "Game",
                PaidUsd = 12m, OrderTotal = 12m, OrderCurrency = "USD", OrderedAt = DateTime.UtcNow
            });
        }
        var earned = (await Body(await Client().GetAsync($"/api/admin/orders/{id}"))).GetProperty("cashbackEarned");
        Assert.Equal(0.36m, earned.GetProperty("amount").GetDecimal());
        Assert.Equal("pending", earned.GetProperty("status").GetString());
        Assert.Equal(3m, earned.GetProperty("percent").GetDecimal());
    }
}
