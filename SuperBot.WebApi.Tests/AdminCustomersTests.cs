using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Support.Chat.Models;
using SuperBot.WebApi.Support.Models;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Карточка клиента. В тестовой среде Keycloak нет — и это удачно: проверяется, что карточка
/// собирается по локальным данным (заказы, ключи, тикеты, чаты) даже когда профиль недоступен,
/// а не падает целиком. Заказы важнее, чем «включена ли учётка».
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class AdminCustomersTests
{
    private readonly TaleShopApiFactory _factory;

    public AdminCustomersTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient Support()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "agent@taleshop.test");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "support");
        return client;
    }

    private async Task<string> SeedCustomerAsync()
    {
        var email = $"cust-{Guid.NewGuid():N}@taleshop.test";
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IMongoDatabase>();
        var orders = scope.ServiceProvider.GetRequiredService<IOrderRepository>();
        var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();
        var gameId = ObjectId.GenerateNewId().ToString();

        await orders.CreateOrderAsync(new Order
        {
            Id = Guid.NewGuid(), OrderNumber = "TS-CUST-1", UserId = email, UserName = email, GameId = gameId, GameName = "Game A",
            IsPaid = true, IsFulfilled = true, OrderDate = DateTime.UtcNow.AddDays(-3), CreatedAt = DateTime.UtcNow.AddDays(-3),
            Status = "DELIVERED", PaymentStatus = "PAID", Currency = "USD", TotalAmount = 12m, Totals = new MoneyTotals { Total = 12m },
            Items = new List<OrderItemSnapshot> { new() { GameId = gameId, Title = "Game A", Quantity = 1 } }
        });
        await orders.CreateOrderAsync(new Order
        {
            Id = Guid.NewGuid(), OrderNumber = "TS-CUST-2", UserId = email, UserName = email, GameId = gameId, GameName = "Game B",
            IsPaid = true, IsFulfilled = false, OrderDate = DateTime.UtcNow.AddDays(-1), CreatedAt = DateTime.UtcNow.AddDays(-1),
            Status = "REFUNDED", PaymentStatus = "REFUNDED", Currency = "USD", TotalAmount = 30m, Totals = new MoneyTotals { Total = 30m }
        });
        await orders.CreateOrderAsync(new Order
        {
            Id = Guid.NewGuid(), OrderNumber = "TS-CUST-3", UserId = email, UserName = email, GameId = gameId, GameName = "Game C",
            IsPaid = false, OrderDate = DateTime.UtcNow, CreatedAt = DateTime.UtcNow,
            Status = "PENDING", PaymentStatus = "UNPAID", Currency = "EUR", TotalAmount = 5m, Totals = new MoneyTotals { Total = 5m }
        });

        await keys.AddAsync(new GameKey { UserId = email, GameId = gameId, Key = $"KEY-{Guid.NewGuid():N}"[..19], KeyType = "steam", IssuedAt = DateTime.UtcNow, IsActive = true });

        await db.GetCollection<SupportTicket>("SupportTickets").InsertOneAsync(new SupportTicket
        {
            Id = ObjectId.GenerateNewId().ToString(), PublicId = $"TKT-{Guid.NewGuid():N}"[..12], UserId = email, UserEmail = email, Subject = "Key not working",
            Status = SupportTicketStatus.Open, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow, LastMessageAt = DateTime.UtcNow
        });
        await db.GetCollection<ChatSession>("SupportChatSessions").InsertOneAsync(new ChatSession
        {
            Id = ObjectId.GenerateNewId().ToString(), Email = email, Status = ChatSessionStatus.Closed,
            CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow, LastMessageAt = DateTime.UtcNow, Summary = "Asked about activation"
        });

        return email;
    }

    [Fact]
    public async Task Card_aggregates_orders_keys_tickets_and_chats_by_email()
    {
        var email = await SeedCustomerAsync();
        var response = await Support().GetAsync($"/api/admin/customers/{Uri.EscapeDataString(email)}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var card = JsonSerializer.Deserialize<JsonElement>(await response.Content.ReadAsStringAsync());

        Assert.Equal(3, card.GetProperty("orderCount").GetInt32());
        Assert.Equal(2, card.GetProperty("paidOrderCount").GetInt32());
        Assert.Equal(1, card.GetProperty("refundedOrderCount").GetInt32());
        // Потрачено: только оплаченные и не возвращённые — 12 USD; возврат на 30 и неоплаченные 5 EUR не входят.
        var spent = card.GetProperty("spentByCurrency");
        Assert.Equal(12m, spent.GetProperty("USD").GetDecimal());
        Assert.False(spent.TryGetProperty("EUR", out _));

        Assert.Equal(1, card.GetProperty("keyCount").GetInt32());
        Assert.Equal(1, card.GetProperty("ticketCount").GetInt32());
        Assert.Equal(1, card.GetProperty("chatCount").GetInt32());
        Assert.Equal("Key not working", card.GetProperty("recentTickets")[0].GetProperty("subject").GetString());
        // Заказы — новые сверху.
        Assert.Equal("TS-CUST-3", card.GetProperty("recentOrders")[0].GetProperty("number").GetString());
        // Ключ отдаётся маской.
        Assert.StartsWith("•", card.GetProperty("recentKeys")[0].GetProperty("masked").GetString());
    }

    [Fact]
    public async Task Card_survives_without_keycloak()
    {
        // В тестах Keycloak не поднят: профиль недоступен, но карточка есть, с флагом.
        var email = await SeedCustomerAsync();
        var card = JsonSerializer.Deserialize<JsonElement>(await Support().GetStringAsync($"/api/admin/customers/{Uri.EscapeDataString(email)}"));
        Assert.True(card.GetProperty("profileUnavailable").GetBoolean());
        Assert.Equal(3, card.GetProperty("orderCount").GetInt32());
    }

    [Fact]
    public async Task Unknown_email_is_404()
    {
        var response = await Support().GetAsync($"/api/admin/customers/{Uri.EscapeDataString($"nobody-{Guid.NewGuid():N}@x.test")}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Search_finds_guests_by_orders_when_keycloak_is_down()
    {
        var email = await SeedCustomerAsync();
        var needle = email[..12];
        var hits = JsonSerializer.Deserialize<JsonElement>(await Support().GetStringAsync($"/api/admin/customers?q={Uri.EscapeDataString(needle)}"));
        var hit = hits.EnumerateArray().Single(h => h.GetProperty("email").GetString() == email);
        Assert.Equal("guest", hit.GetProperty("source").GetString());
        Assert.Equal(3, hit.GetProperty("orderCount").GetInt32());
    }

    [Fact]
    public async Task Block_requires_admin_role()
    {
        var email = await SeedCustomerAsync();
        var response = await Support().PostAsync($"/api/admin/customers/{Uri.EscapeDataString(email)}/block", null);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    /// <summary>
    /// Срезы таблицы клиентов. Keycloak в тестах недоступен, поэтому проверяются срезы,
    /// собираемые по заказам: «с возвратами» находит клиента с REFUNDED-заказом, обход
    /// «все покупатели» движется курсором вперёд и не повторяет строки.
    /// </summary>
    [Fact]
    public async Task Browse_slices_and_cursor_work()
    {
        var email = await SeedCustomerAsync();
        var support = Support();

        // Срез «с возвратами»: клиент с REFUNDED-заказом в нём есть.
        var refunded = await support.GetAsync("/api/admin/customers/browse?filter=refunded&limit=200");
        Assert.Equal(HttpStatusCode.OK, refunded.StatusCode);
        var refundedBody = await refunded.Content.ReadFromJsonAsync<JsonElement>();
        var refundedEmails = refundedBody.GetProperty("items").EnumerateArray()
            .Select(item => item.GetProperty("email").GetString())
            .ToList();
        Assert.Contains(email, refundedEmails);

        // Обход всех покупателей окном в одну строку: следующее окно начинается после первой
        // почты и не возвращает её повторно.
        var first = await (await support.GetAsync("/api/admin/customers/browse?filter=all&limit=1"))
            .Content.ReadFromJsonAsync<JsonElement>();
        var firstEmail = first.GetProperty("items")[0].GetProperty("email").GetString();
        var nextCursor = first.GetProperty("nextCursor").GetString();
        Assert.False(string.IsNullOrEmpty(nextCursor));

        var second = await (await support.GetAsync($"/api/admin/customers/browse?filter=all&limit=1&after={Uri.EscapeDataString(nextCursor!)}"))
            .Content.ReadFromJsonAsync<JsonElement>();
        var secondEmails = second.GetProperty("items").EnumerateArray()
            .Select(item => item.GetProperty("email").GetString())
            .ToList();
        Assert.DoesNotContain(firstEmail, secondEmails);
    }

    /// <summary>Выгрузка среза — обычный CSV с шапкой, а не пятисотка и не пустой файл.</summary>
    [Fact]
    public async Task Export_returns_csv_with_header()
    {
        await SeedCustomerAsync();
        var support = Support();

        var response = await support.GetAsync("/api/admin/customers/export?filter=all");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/csv", response.Content.Headers.ContentType?.MediaType);
        var text = await response.Content.ReadAsStringAsync();
        Assert.StartsWith("Email,Name,Orders,LastOrder,Account", text.TrimStart('\uFEFF'));
        Assert.Contains("@taleshop.test", text);
    }


    /// <summary>
    /// Себя заблокировать нельзя.
    ///
    /// В магазине администратор часто один: заблокировав собственную учётку, он через время
    /// жизни токена теряет админку, а кнопка «Unblock» живёт внутри неё же — выбираться
    /// придётся через консоль Keycloak. Проверка стоит на сервере, а не только в интерфейсе:
    /// спрятанная кнопка не мешает послать запрос напрямую.
    ///
    /// Отказ приходит до обращения к Keycloak — потому тест и работает там, где Keycloak нет.
    /// </summary>
    [Fact]
    public async Task Admin_cannot_block_himself()
    {
        var me = "boss@taleshop.test";
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, me);
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");

        var response = await client.PostAsync($"/api/admin/customers/{Uri.EscapeDataString(me)}/block", null);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(body.GetProperty("ok").GetBoolean());
        Assert.Contains("your own account", body.GetProperty("message").GetString());
    }

}
