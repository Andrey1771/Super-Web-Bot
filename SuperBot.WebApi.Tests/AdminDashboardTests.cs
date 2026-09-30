using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.WebApi.Support.Chat.Models;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Сводка главной страницы админки. Проверяем не «эндпоинт отвечает», а что цифры совпадают
/// с тем, что лежит в базе: дашборд — первое, что открывает владелец, и неверное число там
/// хуже отсутствующего.
///
/// База общая на коллекцию тестов, поэтому сравниваем не абсолютные значения, а разницу
/// «до/после» собственных вставок.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class AdminDashboardTests
{
    private readonly TaleShopApiFactory _factory;

    public AdminDashboardTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient Admin()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "owner@taleshop.test");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        return client;
    }

    private async Task<JsonElement> FetchAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/admin/dashboard");
        response.EnsureSuccessStatusCode();
        return JsonSerializer.Deserialize<JsonElement>(await response.Content.ReadAsStringAsync());
    }

    private static BsonDocument Order(string status, decimal total, string currency, DateTime date, bool paid) => new()
    {
        { "OrderId", Guid.NewGuid().ToString("N") },
        { "OrderGuid", Guid.NewGuid().ToString() },
        { "OrderNumber", $"TS-DASH-{Guid.NewGuid():N}"[..14] },
        { "UserId", "dash@taleshop.test" }, { "UserName", "dash@taleshop.test" },
        { "PaymentProvider", "stripe" }, { "GameId", "g" }, { "GameName", "G" },
        { "IsPaid", paid }, { "IsFulfilled", status == "DELIVERED" },
        { "OrderDate", date }, { "CreatedAt", date },
        { "Status", status }, { "PaymentStatus", paid ? "PAID" : "PENDING" },
        { "Currency", currency },
        { "Totals", new BsonDocument { { "Subtotal", total }, { "DiscountTotal", 0m }, { "TaxTotal", 0m }, { "Total", total } } },
        { "Events", new BsonArray() }, { "Items", new BsonArray() }
    };

    [Fact]
    public async Task Requires_admin_role()
    {
        var stranger = _factory.CreateClient();
        stranger.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "user@taleshop.test");
        var response = await stranger.GetAsync("/api/admin/dashboard");
        Assert.False(response.IsSuccessStatusCode);
    }

    [Fact]
    public async Task Orders_block_counts_todays_paid_orders_and_awaiting_states()
    {
        var admin = Admin();
        var before = await FetchAsync(admin);
        var beforeOrders = before.GetProperty("orders");
        var todayCount = beforeOrders.GetProperty("todayCount").GetInt32();
        var todayRevenue = beforeOrders.GetProperty("todayRevenue").GetDecimal();
        var awaitingKeys = beforeOrders.GetProperty("awaitingKeys").GetInt32();
        var awaitingPayment = beforeOrders.GetProperty("awaitingPayment").GetInt32();

        using (var scope = _factory.Services.CreateScope())
        {
            var orders = scope.ServiceProvider.GetRequiredService<IMongoDatabase>().GetCollection<BsonDocument>("Orders");
            var now = DateTime.UtcNow;
            await orders.InsertManyAsync(new[]
            {
                Order("DELIVERED", 10m, "USD", now, paid: true),           // сегодня, оплачен → +1, +10
                Order("AWAITING_KEYS", 5m, "USD", now, paid: true),        // сегодня, оплачен, ждёт ключа → +1, +5, awaitingKeys+1
                Order("AWAITING_PAYMENT", 99m, "XTR", now, paid: false),   // не оплачен → в выручку не идёт, awaitingPayment+1
                Order("DELIVERED", 100m, "USD", now.AddDays(-10), paid: true) // старше недели → никуда
            });
        }

        var after = (await FetchAsync(admin)).GetProperty("orders");
        Assert.Equal(todayCount + 2, after.GetProperty("todayCount").GetInt32());
        Assert.Equal(todayRevenue + 15m, after.GetProperty("todayRevenue").GetDecimal());
        Assert.Equal(awaitingKeys + 1, after.GetProperty("awaitingKeys").GetInt32());
        Assert.Equal(awaitingPayment + 1, after.GetProperty("awaitingPayment").GetInt32());
    }

    [Fact]
    public async Task Disputes_waiting_for_evidence_are_listed_with_the_nearest_deadline_first()
    {
        var number = $"TS-DISP-{Guid.NewGuid():N}"[..16];
        var answered = $"TS-DISP-{Guid.NewGuid():N}"[..16];
        var due = DateTime.UtcNow.AddHours(30);
        using (var scope = _factory.Services.CreateScope())
        {
            var orders = scope.ServiceProvider.GetRequiredService<IMongoDatabase>().GetCollection<BsonDocument>("Orders");
            BsonDocument Disputed(string orderNumber, bool hasEvidence)
            {
                var doc = Order("DELIVERED", 20m, "USD", DateTime.UtcNow, paid: true);
                doc["OrderNumber"] = orderNumber;
                doc["PaymentStatus"] = "DISPUTED";
                doc["Dispute"] = new BsonDocument
                {
                    { "Id", $"dp_{Guid.NewGuid():N}" }, { "Status", hasEvidence ? "under_review" : "needs_response" },
                    { "AmountMinor", 2000L }, { "Currency", "USD" }, { "EvidenceDueBy", due }, { "HasEvidence", hasEvidence },
                    { "OpenedAt", DateTime.UtcNow }
                };
                return doc;
            }
            await orders.InsertManyAsync(new[] { Disputed(number, hasEvidence: false), Disputed(answered, hasEvidence: true) });
        }

        var disputes = (await FetchAsync(Admin())).GetProperty("payments").GetProperty("disputesAwaitingEvidence").EnumerateArray().ToList();
        var mine = Assert.Single(disputes, item => item.GetProperty("orderNumber").GetString() == number);
        Assert.Equal(20m, mine.GetProperty("amount").GetDecimal());
        Assert.NotEqual(JsonValueKind.Null, mine.GetProperty("evidenceDueBy").ValueKind);
        // Доказательства уже отправлены — ждать нечего, в «Needs attention» спору не место.
        Assert.DoesNotContain(disputes, item => item.GetProperty("orderNumber").GetString() == answered);
    }

    [Fact]
    public async Task Support_block_counts_escalated_chats()
    {
        var admin = Admin();
        var before = (await FetchAsync(admin)).GetProperty("support").GetProperty("chatsNeedingAgent").GetInt32();

        using (var scope = _factory.Services.CreateScope())
        {
            var sessions = scope.ServiceProvider.GetRequiredService<IMongoDatabase>().GetCollection<ChatSession>("SupportChatSessions");
            await sessions.InsertManyAsync(new[]
            {
                new ChatSession { Id = ObjectId.GenerateNewId().ToString(), Status = ChatSessionStatus.NeedsAgent, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow.AddMinutes(-30) },
                new ChatSession { Id = ObjectId.GenerateNewId().ToString(), Status = ChatSessionStatus.Ai, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow }
            });
        }

        var support = (await FetchAsync(admin)).GetProperty("support");
        Assert.Equal(before + 1, support.GetProperty("chatsNeedingAgent").GetInt32());
        // Самое старое ждущее обращение — минимум полчаса, раз мы такое положили.
        Assert.True(support.GetProperty("oldestWaitingMinutes").GetInt32() >= 30);
    }

    [Fact]
    public async Task Health_block_lists_mongo_as_ok()
    {
        var health = (await FetchAsync(Admin())).GetProperty("health").GetProperty("items");
        var mongo = health.EnumerateArray().Single(i => i.GetProperty("name").GetString() == "MongoDB");
        Assert.Equal("ok", mongo.GetProperty("state").GetString());
    }

    /// <summary>
    /// Выключенные пробы не имеют права утешать. В тестовом хосте сеть отключена
    /// (Dashboard:ExternalProbes=false), и всё, что проверяется наружу, обязано остаться в
    /// «configured» — «настроено, но не проверено», — а не превратиться в зелёное «ok».
    /// </summary>
    [Theory]
    [InlineData("Stripe")]
    [InlineData("Mail (SMTP)")]
    [InlineData("Keycloak")]
    public async Task ProbesDisabled_doNotProduceAGreenLight(string name)
    {
        var health = (await FetchAsync(Admin())).GetProperty("health").GetProperty("items");
        var item = health.EnumerateArray().Single(i => i.GetProperty("name").GetString() == name);

        var state = item.GetProperty("state").GetString();
        Assert.Contains(state, new[] { "configured", "unconfigured" });
        Assert.NotEqual("ok", state);
    }

    [Fact]
    public async Task SupportLlm_isAlsoProbedRatherThanAssumed()
    {
        var health = (await FetchAsync(Admin())).GetProperty("health").GetProperty("items");
        var item = health.EnumerateArray()
            .Single(i => (i.GetProperty("name").GetString() ?? string.Empty).StartsWith("Support LLM"));

        Assert.NotEqual("ok", item.GetProperty("state").GetString());
    }

    /// <summary>
    /// Почта попала в список только на первом этапе, а до этого её не проверял никто —
    /// хотя без неё не уходят ключи, то есть товар, за который заплатили.
    /// </summary>
    [Fact]
    public async Task Mail_isPartOfTheHealthBlock()
    {
        var health = (await FetchAsync(Admin())).GetProperty("health").GetProperty("items");
        var names = health.EnumerateArray().Select(i => i.GetProperty("name").GetString()).ToList();

        Assert.Contains("Mail (SMTP)", names);
    }

    /// <summary>
    /// «Поднят ли контейнер» и «слышит ли бот людей» — два разных вопроса, и в сводке им
    /// положены две разные строки. Пока строка была одна, мёртвый вебхук неделю выглядел
    /// зелёным: бот-сервис при этом честно отвечал на запросы.
    /// </summary>
    [Fact]
    public async Task BotServiceAndWebhook_areSeparateRows()
    {
        var health = (await FetchAsync(Admin())).GetProperty("health").GetProperty("items");
        var names = health.EnumerateArray().Select(i => i.GetProperty("name").GetString()).ToList();

        Assert.Contains("Bot service", names);
        Assert.Contains("Telegram webhook", names);
    }

    [Fact]
    public async Task WebhookRow_doesNotGoGreenWithoutAsking()
    {
        // Пробы в тестовом хосте выключены — значит про вебхук ничего не известно, и
        // зелёного кружка он не заслуживает.
        var health = (await FetchAsync(Admin())).GetProperty("health").GetProperty("items");
        var item = health.EnumerateArray().Single(i => i.GetProperty("name").GetString() == "Telegram webhook");

        Assert.NotEqual("ok", item.GetProperty("state").GetString());
    }
}
