using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Платёжный пайплайн целиком: цена → намерение → финализация → заказ,
/// через настоящий HTTP и настоящую (эфемерную) MongoDB. Наружу ходит только Stripe,
/// и он подменён фейком — всё остальное работает как в бою.
///
/// Смысл этих тестов: они ловят ровно те дефекты, которые мы находили руками —
/// подмену цены, гонку двух финализаторов, повторные события и потерянные заказы.
/// </summary>
public class PaymentsPipelineTests : IClassFixture<TaleShopApiFactory>
{
    // Фабрика (и её Mongo) общая на класс, поэтому у КАЖДОГО теста свой покупатель:
    // иначе переиспользование намерения из одного теста ломало бы соседний.
    // Личность определяется по email (см. CurrentUserExtensions.GetUserKey), поэтому
    // уникальным должен быть именно он.
    private readonly string _userEmail = $"buyer-{Guid.NewGuid():N}@taleshop.test";
    private readonly string _userSub = $"user-{Guid.NewGuid():N}";

    private readonly TaleShopApiFactory _factory;

    public PaymentsPipelineTests(TaleShopApiFactory factory) => _factory = factory;

    // ---------- helpers ----------

    private HttpClient CreateClient(bool authenticated = true)
    {
        var client = _factory.CreateClient();
        if (authenticated)
        {
            client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, _userEmail);
            client.DefaultRequestHeaders.Add(TestAuthHandler.SubHeader, _userSub);
        }
        return client;
    }

    /// <summary>Заводит игру в каталоге и возвращает её id — цена берётся именно отсюда.</summary>
    private async Task<string> SeedGameAsync(decimal price)
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();

        var name = $"Test Game {Guid.NewGuid():N}";
        await games.CreateAsync(new Game
        {
            Name = name,
            Title = name,
            Price = price,
            ImagePath = "cover.png"
        });

        var all = await games.GetAllAsync();
        return all.First(game => game.Name == name).Id!;
    }

    private async Task<Order?> GetOrderAsync(string paymentIntentId)
    {
        using var scope = _factory.Services.CreateScope();
        var orders = scope.ServiceProvider.GetRequiredService<IOrderRepository>();
        return await orders.GetByPaymentIntentIdAsync(paymentIntentId);
    }

    private async Task<long> CountOrdersAsync(string paymentIntentId)
    {
        using var scope = _factory.Services.CreateScope();
        var database = scope.ServiceProvider.GetRequiredService<IMongoDatabase>();
        return await database.GetCollection<BsonDocument>("Orders")
            .CountDocumentsAsync(Builders<BsonDocument>.Filter.Eq("PaymentIntentId", paymentIntentId));
    }

    /// <summary>Создаёт намерение через API и возвращает его id.</summary>
    private async Task<(string PaymentIntentId, JsonElement Body)> CreateIntentAsync(
        HttpClient client, string gameId, int quantity = 1)
    {
        var response = await client.PostAsJsonAsync("/api/payments/create-payment-intent", new
        {
            items = new[] { new { gameId, quantity } }
        });

        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var clientSecret = body.GetProperty("clientSecret").GetString()!;

        // В фейке clientSecret имеет вид "{intentId}_secret_test".
        return (clientSecret[..clientSecret.IndexOf("_secret", StringComparison.Ordinal)], body);
    }

    /// <summary>Подписывает тело ровно так, как это делает Stripe: t=…,v1=HMAC-SHA256(secret, "t.payload").</summary>
    private static string SignPayload(string payload)
    {
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var signed = $"{timestamp}.{payload}";
        var hash = new HMACSHA256(Encoding.UTF8.GetBytes(TaleShopApiFactory.WebhookSecret))
            .ComputeHash(Encoding.UTF8.GetBytes(signed));
        return $"t={timestamp},v1={Convert.ToHexString(hash).ToLowerInvariant()}";
    }

    /// <summary>
    /// Событие собирается типами самого Stripe.net и сериализуется его же сериализатором —
    /// так форма JSON гарантированно совпадает с тем, что ожидает EventUtility.ConstructEvent.
    /// Ручной JSON тут хрупок: парсер SDK падает на малейшем расхождении.
    /// </summary>
    private static string BuildEventPayload(string eventId, string type, Stripe.IHasObject payload) =>
        new Stripe.Event
        {
            Id = eventId,
            Object = "event",
            Type = type,
            ApiVersion = Stripe.StripeConfiguration.ApiVersion,
            Created = DateTime.UtcNow,
            Data = new Stripe.EventData { Object = payload }
        }.ToJson();

    private static string PaymentSucceededPayload(string eventId, string paymentIntentId) =>
        BuildEventPayload(eventId, "payment_intent.succeeded", new Stripe.PaymentIntent
        {
            Id = paymentIntentId,
            Object = "payment_intent",
            Status = "succeeded"
        });

    private static string ChargeRefundedPayload(string eventId, string paymentIntentId, long amount, long refunded) =>
        BuildEventPayload(eventId, "charge.refunded", new Stripe.Charge
        {
            Id = "ch_test",
            Object = "charge",
            PaymentIntentId = paymentIntentId,
            Amount = amount,
            AmountRefunded = refunded,
            Currency = "usd"
        });

    /// <summary>Как EnsureSuccessStatusCode, но показывает тело ответа — иначе отладка вслепую.</summary>
    private static async Task AssertSuccessAsync(HttpResponseMessage response)
    {
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync();
            Assert.Fail($"Expected success, got {(int)response.StatusCode}. Body: {body}");
        }
    }

    private async Task<HttpResponseMessage> SendWebhookAsync(HttpClient client, string payload, bool sign = true)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/payments/webhook")
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json")
        };
        request.Headers.Add("Stripe-Signature", sign ? SignPayload(payload) : "t=1,v1=deadbeef");
        return await client.SendAsync(request);
    }

    // ---------- цена ----------

    [Fact]
    public async Task Create_payment_intent_requires_authentication()
    {
        var gameId = await SeedGameAsync(30m);
        var client = CreateClient(authenticated: false);

        var response = await client.PostAsJsonAsync("/api/payments/create-payment-intent", new
        {
            items = new[] { new { gameId, quantity = 1 } }
        });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Price_comes_from_catalog_and_client_money_fields_are_ignored()
    {
        var gameId = await SeedGameAsync(59.99m);
        var client = CreateClient();

        // Пытаемся навязать свою цену и валюту — ровно та атака, что была возможна раньше.
        var response = await client.PostAsJsonAsync("/api/payments/create-payment-intent", new
        {
            items = new[] { new { gameId, quantity = 1, unitPrice = 0.01m, lineTotal = 0.01m } },
            amount = 1,
            total = 0.01m,
            currency = "INR"
        });

        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(59.99m, body.GetProperty("totals").GetProperty("total").GetDecimal());
    }

    [Fact]
    public async Task Unknown_game_is_rejected()
    {
        var client = CreateClient();

        var response = await client.PostAsJsonAsync("/api/payments/create-payment-intent", new
        {
            items = new[] { new { gameId = "does-not-exist", quantity = 1 } }
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Changing_the_cart_reuses_the_same_payment_intent()
    {
        var gameId = await SeedGameAsync(10m);
        var client = CreateClient();
        var before = _factory.Stripe.CreateCount;

        var first = await CreateIntentAsync(client, gameId, quantity: 1);
        var second = await CreateIntentAsync(client, gameId, quantity: 2);

        Assert.Equal(first.PaymentIntentId, second.PaymentIntentId);
        Assert.Equal(before + 1, _factory.Stripe.CreateCount);
        Assert.Equal(20m, second.Body.GetProperty("totals").GetProperty("total").GetDecimal());
    }

    // ---------- финализация ----------

    [Fact]
    public async Task Confirm_creates_order_and_is_idempotent()
    {
        var gameId = await SeedGameAsync(25m);
        var client = CreateClient();
        var (intentId, _) = await CreateIntentAsync(client, gameId);
        _factory.Stripe.MarkSucceeded(intentId);

        var first = await client.PostAsJsonAsync("/api/payments/confirm-payment-intent", new { paymentIntentId = intentId });
        var second = await client.PostAsJsonAsync("/api/payments/confirm-payment-intent", new { paymentIntentId = intentId });

        first.EnsureSuccessStatusCode();
        second.EnsureSuccessStatusCode();

        var firstBody = await first.Content.ReadFromJsonAsync<JsonElement>();
        var secondBody = await second.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(firstBody.GetProperty("orderId").GetString(), secondBody.GetProperty("orderId").GetString());
        Assert.Equal(1, await CountOrdersAsync(intentId));
    }

    [Fact]
    public async Task Confirm_is_rejected_when_payment_did_not_succeed()
    {
        var gameId = await SeedGameAsync(25m);
        var client = CreateClient();
        var (intentId, _) = await CreateIntentAsync(client, gameId);
        // Намеренно НЕ помечаем оплаченным.

        var response = await client.PostAsJsonAsync("/api/payments/confirm-payment-intent", new { paymentIntentId = intentId });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, await CountOrdersAsync(intentId));
    }

    [Fact]
    public async Task Confirm_of_someone_elses_payment_is_forbidden()
    {
        var gameId = await SeedGameAsync(25m);
        var owner = CreateClient();
        var (intentId, _) = await CreateIntentAsync(owner, gameId);
        _factory.Stripe.MarkSucceeded(intentId);

        var attacker = _factory.CreateClient();
        attacker.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "attacker@taleshop.test");
        attacker.DefaultRequestHeaders.Add(TestAuthHandler.SubHeader, "user-attacker");

        var response = await attacker.PostAsJsonAsync("/api/payments/confirm-payment-intent", new { paymentIntentId = intentId });

        Assert.True(response.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.Unauthorized);
        Assert.Equal(0, await CountOrdersAsync(intentId));
    }

    // ---------- вебхук ----------

    [Fact]
    public async Task Webhook_with_invalid_signature_is_rejected()
    {
        var client = CreateClient(authenticated: false);
        var payload = PaymentSucceededPayload("evt_bad_sig", "pi_whatever");

        var response = await SendWebhookAsync(client, payload, sign: false);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Webhook_finalizes_the_order()
    {
        var gameId = await SeedGameAsync(40m);
        var client = CreateClient();
        var (intentId, _) = await CreateIntentAsync(client, gameId);
        _factory.Stripe.MarkSucceeded(intentId);

        var response = await SendWebhookAsync(CreateClient(authenticated: false),
            PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", intentId));

        await AssertSuccessAsync(response);

        var order = await GetOrderAsync(intentId);
        Assert.NotNull(order);
        Assert.True(order!.IsPaid);
        Assert.Equal(40m, order.TotalAmount);
    }

    [Fact]
    public async Task Duplicate_webhook_event_is_processed_only_once()
    {
        var gameId = await SeedGameAsync(15m);
        var client = CreateClient();
        var (intentId, _) = await CreateIntentAsync(client, gameId);
        _factory.Stripe.MarkSucceeded(intentId);

        var eventId = $"evt_{Guid.NewGuid():N}";
        var payload = PaymentSucceededPayload(eventId, intentId);
        var anonymous = CreateClient(authenticated: false);

        var first = await SendWebhookAsync(anonymous, payload);
        var second = await SendWebhookAsync(anonymous, payload);

        first.EnsureSuccessStatusCode();
        second.EnsureSuccessStatusCode();
        Assert.Equal(1, await CountOrdersAsync(intentId));
    }

    [Fact]
    public async Task Confirm_and_webhook_racing_create_exactly_one_order()
    {
        // Ровно та гонка, из-за которой на success-странице возникал «Order finalization issue».
        var gameId = await SeedGameAsync(35m);
        var client = CreateClient();
        var (intentId, _) = await CreateIntentAsync(client, gameId);
        _factory.Stripe.MarkSucceeded(intentId);

        var anonymous = CreateClient(authenticated: false);
        var payload = PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", intentId);

        var confirmTask = client.PostAsJsonAsync("/api/payments/confirm-payment-intent", new { paymentIntentId = intentId });
        var webhookTask = SendWebhookAsync(anonymous, payload);

        await Task.WhenAll(confirmTask, webhookTask);

        // Заказ должен быть ровно один, независимо от того, кто выиграл гонку.
        Assert.Equal(1, await CountOrdersAsync(intentId));
        Assert.NotNull(await GetOrderAsync(intentId));
    }

    [Fact]
    public async Task Refund_webhook_marks_the_order_refunded()
    {
        var gameId = await SeedGameAsync(20m);
        var client = CreateClient();
        var (intentId, _) = await CreateIntentAsync(client, gameId);
        _factory.Stripe.MarkSucceeded(intentId);

        var anonymous = CreateClient(authenticated: false);
        var paid = await SendWebhookAsync(anonymous, PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", intentId));
        await AssertSuccessAsync(paid);
        Assert.NotNull(await GetOrderAsync(intentId));

        var refund = await SendWebhookAsync(anonymous,
            ChargeRefundedPayload($"evt_{Guid.NewGuid():N}", intentId, amount: 2000, refunded: 2000));

        await AssertSuccessAsync(refund);

        var order = await GetOrderAsync(intentId);
        Assert.NotNull(order);
        Assert.Equal("REFUNDED", order!.PaymentStatus);
        Assert.Equal("REFUNDED", order.Status);
    }
}
