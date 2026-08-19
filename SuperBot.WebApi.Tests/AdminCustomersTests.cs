using System.Net;
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
}
