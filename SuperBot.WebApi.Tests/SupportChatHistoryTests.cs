using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.WebApi.Support.Chat.Models;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Какой кусок переписки отдают чат-эндпоинты, когда сообщений больше лимита.
///
/// Отдавать нужно ХВОСТ. Раньше сортировка шла по возрастанию, а лимит применялся после неё,
/// и наружу уходило начало диалога: специалист открывал длинную переписку и не видел ни одной
/// свежей реплики клиента — ровно тех, ради которых он её и открыл. Собиралось это молча,
/// поэтому проверка идёт через настоящие HTTP-эндпоинты на эфемерной Mongo.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class SupportChatHistoryTests
{
    private readonly TaleShopApiFactory _factory;

    public SupportChatHistoryTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient CreateAgentClient()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "agent@taleshop.test");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "support");
        return client;
    }

    /// <summary>
    /// Кладём переписку прямо в базу: через публичный эндпоинт каждое сообщение дёргало бы
    /// языковую модель, а проверяется здесь выборка, а не ответы ассистента.
    /// </summary>
    private async Task<string> SeedConversationAsync(int messageCount)
    {
        using var scope = _factory.Services.CreateScope();
        var database = scope.ServiceProvider.GetRequiredService<IMongoDatabase>();
        var sessions = database.GetCollection<ChatSession>("SupportChatSessions");
        var messages = database.GetCollection<ChatMessage>("SupportChatMessages");

        var startedAt = new DateTime(2026, 8, 18, 9, 0, 0, DateTimeKind.Utc);
        var session = new ChatSession
        {
            Id = ObjectId.GenerateNewId().ToString(),
            CreatedAt = startedAt,
            UpdatedAt = startedAt,
            Status = ChatSessionStatus.Ai,
            Language = "ru"
        };
        await sessions.InsertOneAsync(session);

        var batch = Enumerable.Range(0, messageCount).Select(index => new ChatMessage
        {
            Id = ObjectId.GenerateNewId().ToString(),
            SessionId = session.Id,
            Role = index % 2 == 0 ? ChatMessageRole.User : ChatMessageRole.Assistant,
            AuthorName = index % 2 == 0 ? "Guest" : "Tale Support (AI)",
            Text = $"message-{index}",
            // Разные минуты: порядок задаётся временем, а не порядком вставки.
            CreatedAt = startedAt.AddMinutes(index)
        });
        await messages.InsertManyAsync(batch);

        return session.Id;
    }

    private static async Task<List<string>> ReadTextsAsync(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        var payload = JsonSerializer.Deserialize<JsonElement>(await response.Content.ReadAsStringAsync());
        return payload.GetProperty("messages")
            .EnumerateArray()
            .Select(message => message.GetProperty("text").GetString() ?? string.Empty)
            .ToList();
    }

    [Fact]
    public async Task Agent_sees_the_end_of_a_long_conversation()
    {
        var sessionId = await SeedConversationAsync(120);
        var agent = CreateAgentClient();

        var texts = await ReadTextsAsync(
            await agent.GetAsync($"/api/support/admin/chat/sessions/{sessionId}?messageLimit=100"));

        Assert.Equal(100, texts.Count);
        Assert.Equal("message-20", texts.First());
        Assert.Equal("message-119", texts.Last());
    }

    [Fact]
    public async Task Customer_widget_also_gets_the_end_of_the_conversation()
    {
        var sessionId = await SeedConversationAsync(80);
        var guest = _factory.CreateClient();

        var texts = await ReadTextsAsync(
            await guest.GetAsync($"/api/support/chat/sessions/{sessionId}?messageLimit=50"));

        Assert.Equal(50, texts.Count);
        Assert.Equal("message-30", texts.First());
        Assert.Equal("message-79", texts.Last());
    }

    [Fact]
    public async Task History_stays_in_chronological_order()
    {
        var sessionId = await SeedConversationAsync(30);
        var agent = CreateAgentClient();

        var texts = await ReadTextsAsync(
            await agent.GetAsync($"/api/support/admin/chat/sessions/{sessionId}?messageLimit=100"));

        // Обрезка идёт с конца, а отдаётся всё равно по возрастанию времени: панель
        // специалиста рисует массив как есть, без собственной сортировки.
        Assert.Equal(Enumerable.Range(0, 30).Select(index => $"message-{index}"), texts);
    }

    // ---------- прокрутка вверх ----------

    private static async Task<List<string>> ReadPageAsync(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        var payload = JsonSerializer.Deserialize<JsonElement>(await response.Content.ReadAsStringAsync());
        return payload.EnumerateArray()
            .Select(message => message.GetProperty("text").GetString() ?? string.Empty)
            .ToList();
    }

    [Fact]
    public async Task Scrolling_up_returns_the_page_right_before_the_cursor()
    {
        var sessionId = await SeedConversationAsync(80);
        var guest = _factory.CreateClient();

        // Виджет получил хвост (message-30 … message-79) и просит то, что было раньше.
        var before = new DateTime(2026, 8, 18, 9, 30, 0, DateTimeKind.Utc).ToString("O");
        var page = await ReadPageAsync(
            await guest.GetAsync($"/api/support/chat/sessions/{sessionId}/messages?before={Uri.EscapeDataString(before)}&limit=20"));

        Assert.Equal(20, page.Count);
        Assert.Equal("message-10", page.First());
        Assert.Equal("message-29", page.Last());
    }

    [Fact]
    public async Task Start_of_the_conversation_returns_less_than_a_page()
    {
        var sessionId = await SeedConversationAsync(80);
        var guest = _factory.CreateClient();

        // Запрос от пятой реплики: раньше неё всего пять, и виджет по короткому ответу
        // понимает, что листать дальше некуда.
        var before = new DateTime(2026, 8, 18, 9, 5, 0, DateTimeKind.Utc).ToString("O");
        var page = await ReadPageAsync(
            await guest.GetAsync($"/api/support/chat/sessions/{sessionId}/messages?before={Uri.EscapeDataString(before)}&limit=50"));

        Assert.Equal(5, page.Count);
        Assert.Equal("message-0", page.First());
        Assert.Equal("message-4", page.Last());
    }

    [Fact]
    public async Task Agent_can_scroll_up_too()
    {
        var sessionId = await SeedConversationAsync(80);
        var agent = CreateAgentClient();

        var before = new DateTime(2026, 8, 18, 9, 30, 0, DateTimeKind.Utc).ToString("O");
        var page = await ReadPageAsync(
            await agent.GetAsync($"/api/support/admin/chat/sessions/{sessionId}/messages?before={Uri.EscapeDataString(before)}&limit=20"));

        Assert.Equal(20, page.Count);
        Assert.Equal("message-10", page.First());
        Assert.Equal("message-29", page.Last());
    }

    [Fact]
    public async Task Agent_history_endpoint_is_closed_to_strangers()
    {
        var sessionId = await SeedConversationAsync(10);
        var stranger = _factory.CreateClient();

        var before = new DateTime(2026, 8, 18, 9, 5, 0, DateTimeKind.Utc).ToString("O");
        var response = await stranger.GetAsync(
            $"/api/support/admin/chat/sessions/{sessionId}/messages?before={Uri.EscapeDataString(before)}");

        // У клиентского маршрута доступ по идентификатору сессии, у админского — по роли.
        // Новый эндпоинт живёт в админском контроллере и должен наследовать его политику.
        Assert.False(response.IsSuccessStatusCode);
    }

    [Fact]
    public async Task Closed_conversation_can_still_be_scrolled_up()
    {
        var sessionId = await SeedConversationAsync(40);

        using (var scope = _factory.Services.CreateScope())
        {
            var sessions = scope.ServiceProvider
                .GetRequiredService<IMongoDatabase>()
                .GetCollection<ChatSession>("SupportChatSessions");
            await sessions.UpdateOneAsync(
                Builders<ChatSession>.Filter.Eq(s => s.Id, sessionId),
                Builders<ChatSession>.Update.Set(s => s.Status, ChatSessionStatus.Closed));
        }

        var guest = _factory.CreateClient();
        var before = new DateTime(2026, 8, 18, 9, 10, 0, DateTimeKind.Utc).ToString("O");
        var response = await guest.GetAsync(
            $"/api/support/chat/sessions/{sessionId}/messages?before={Uri.EscapeDataString(before)}&limit=50");

        // Закрытый диалог остаётся на экране у клиента — листать его вверх он должен так же.
        // Ответ 410 виджет принял бы за «сессии больше нет» и начал бы новый разговор.
        var page = await ReadPageAsync(response);
        Assert.Equal(10, page.Count);
        Assert.Equal("message-9", page.Last());
    }

    [Fact]
    public async Task Short_conversation_is_returned_whole()
    {
        var sessionId = await SeedConversationAsync(5);
        var agent = CreateAgentClient();

        var texts = await ReadTextsAsync(
            await agent.GetAsync($"/api/support/admin/chat/sessions/{sessionId}?messageLimit=100"));

        Assert.Equal(5, texts.Count);
        Assert.Equal("message-0", texts.First());
        Assert.Equal("message-4", texts.Last());
    }
}
