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
[Collection(IntegrationTestCollection.Name)]
public class PaymentsPipelineTests
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

    /// <summary>Кладёт свободный ключ в пул игры — из него выдаёт fulfillment.</summary>
    private async Task SeedPoolKeyAsync(string gameId, string key)
    {
        using var scope = _factory.Services.CreateScope();
        var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();
        await keys.AddPoolKeysAsync(gameId, "Steam", new[] { key });
    }

    /// <summary>Создаёт намерение через API и возвращает его id. email — для гостевого пути.</summary>
    private async Task<(string PaymentIntentId, JsonElement Body)> CreateIntentAsync(
        HttpClient client, string gameId, int quantity = 1, string? email = null)
    {
        var response = await client.PostAsJsonAsync("/api/payments/create-payment-intent", new
        {
            items = new[] { new { gameId, quantity } },
            email
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
    public async Task Guest_without_email_is_rejected()
    {
        var gameId = await SeedGameAsync(30m);
        var client = CreateClient(authenticated: false);

        var response = await client.PostAsJsonAsync("/api/payments/create-payment-intent", new
        {
            items = new[] { new { gameId, quantity = 1 } }
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("not-an-email")]
    [InlineData("   ")]
    public async Task Guest_with_invalid_email_is_rejected(string email)
    {
        var gameId = await SeedGameAsync(30m);
        var client = CreateClient(authenticated: false);

        var response = await client.PostAsJsonAsync("/api/payments/create-payment-intent", new
        {
            items = new[] { new { gameId, quantity = 1 } },
            email
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Guest_keys_are_held_until_email_is_confirmed()
    {
        // Полный гостевой путь: оплата → заказ есть, ключи придержаны → письмо →
        // клик по ссылке → ключи выданы и отправлены на почту.
        var gameId = await SeedGameAsync(21m);
        var poolKey = $"GUEST-{Guid.NewGuid():N}"[..20].ToUpperInvariant();
        await SeedPoolKeyAsync(gameId, poolKey);

        var guestEmail = $"guest-{Guid.NewGuid():N}@taleshop.test";
        var guest = CreateClient(authenticated: false);

        var (intentId, _) = await CreateIntentAsync(guest, gameId, email: guestEmail);
        _factory.Stripe.MarkSucceeded(intentId);

        var webhook = await SendWebhookAsync(guest, PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", intentId));
        await AssertSuccessAsync(webhook);

        // Заказ создан и оплачен, но ключи НЕ выданы.
        var order = await GetOrderAsync(intentId);
        Assert.NotNull(order);
        Assert.True(order!.IsPaid);
        Assert.False(order.IsFulfilled);

        using (var scope = _factory.Services.CreateScope())
        {
            var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();
            Assert.Empty(await keys.GetByUserAsync(guestEmail, 10));
        }

        // Письмо с подтверждением пришло; достаём токен и «кликаем» по ссылке.
        var verificationMail = _factory.Mail.LastTo(guestEmail);
        Assert.NotNull(verificationMail);
        Assert.Contains("Confirm", verificationMail!.Subject);
        var token = CapturingMailSender.ExtractToken(verificationMail, "/api/payments/verify-delivery");

        var noRedirect = _factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false // редирект уводит на фронтовый URL, которого в тестовом хосте нет
        });
        var verify = await noRedirect.GetAsync($"/api/payments/verify-delivery?token={token}");

        Assert.Equal(HttpStatusCode.Redirect, verify.StatusCode);
        Assert.Contains("delivery-confirmed?status=ok", verify.Headers.Location!.ToString());

        // Ключ выдан, заказ закрыт, письмо с ключом ушло.
        var fulfilled = await GetOrderAsync(intentId);
        Assert.True(fulfilled!.IsFulfilled);

        var keysMail = _factory.Mail.AllTo(guestEmail).Last();
        Assert.Contains(poolKey, keysMail.TextBody);
    }

    [Fact]
    public async Task Restock_after_verification_delivers_and_emails_the_keys()
    {
        // Регрессия реального бага: гость подтвердил почту при ПУСТОМ складе («pending»),
        // админ пополнил пул — раньше бэкфилл выдавал ключ молча, и гость не получал ничего.
        var gameId = await SeedGameAsync(18m);
        var guestEmail = $"guest-{Guid.NewGuid():N}@taleshop.test";
        var guest = CreateClient(authenticated: false);

        var (intentId, _) = await CreateIntentAsync(guest, gameId, email: guestEmail);
        _factory.Stripe.MarkSucceeded(intentId);
        await AssertSuccessAsync(await SendWebhookAsync(guest, PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", intentId)));

        // Подтверждаем почту при пустом складе → pending.
        var token = CapturingMailSender.ExtractToken(_factory.Mail.LastTo(guestEmail)!, "/api/payments/verify-delivery");
        var noRedirect = _factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var verify = await noRedirect.GetAsync($"/api/payments/verify-delivery?token={token}");
        Assert.Contains("status=pending", verify.Headers.Location!.ToString());

        // Админ пополняет пул — бэкфилл должен довыдать И отправить письмо.
        var poolKey = $"RESTOCK-{Guid.NewGuid():N}"[..20].ToUpperInvariant();
        var admin = _factory.CreateClient();
        admin.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "admin@taleshop.test");
        admin.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        var restock = await admin.PostAsJsonAsync($"/api/admin/keys/inventory/{gameId}", new
        {
            keyType = "Steam",
            keys = new[] { poolKey }
        });
        await AssertSuccessAsync(restock);

        var order = await GetOrderAsync(intentId);
        Assert.True(order!.IsFulfilled);

        var keysMail = _factory.Mail.AllTo(guestEmail).Last();
        Assert.Contains(poolKey, keysMail.TextBody);
    }

    [Fact]
    public async Task Restock_does_not_deliver_to_unverified_guest()
    {
        // Гейт: пока почта не подтверждена, даже пополнение пула не выдаёт ключи заказу.
        var gameId = await SeedGameAsync(12m);
        var guestEmail = $"guest-{Guid.NewGuid():N}@taleshop.test";
        var guest = CreateClient(authenticated: false);

        var (intentId, _) = await CreateIntentAsync(guest, gameId, email: guestEmail);
        _factory.Stripe.MarkSucceeded(intentId);
        await AssertSuccessAsync(await SendWebhookAsync(guest, PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", intentId)));

        var admin = _factory.CreateClient();
        admin.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "admin@taleshop.test");
        admin.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        await AssertSuccessAsync(await admin.PostAsJsonAsync($"/api/admin/keys/inventory/{gameId}", new
        {
            keyType = "Steam",
            keys = new[] { $"HELD-{Guid.NewGuid():N}"[..20] }
        }));

        var order = await GetOrderAsync(intentId);
        Assert.False(order!.IsFulfilled); // ключ остался в пуле, а не ушёл неподтверждённому гостю

        using var scope = _factory.Services.CreateScope();
        var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();
        Assert.Empty(await keys.GetByUserAsync(guestEmail, 10));
    }

    [Fact]
    public async Task Resend_verification_sends_fresh_working_link()
    {
        // «Не пришло письмо» / ссылка протухла: повторная отправка даёт НОВЫЙ рабочий токен.
        var gameId = await SeedGameAsync(14m);
        var poolKey = $"RESEND-{Guid.NewGuid():N}"[..20].ToUpperInvariant();
        await SeedPoolKeyAsync(gameId, poolKey);

        var guestEmail = $"guest-{Guid.NewGuid():N}@taleshop.test";
        var guest = CreateClient(authenticated: false);
        var (intentId, _) = await CreateIntentAsync(guest, gameId, email: guestEmail);
        _factory.Stripe.MarkSucceeded(intentId);
        await AssertSuccessAsync(await SendWebhookAsync(guest, PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", intentId)));

        var firstMailCount = _factory.Mail.AllTo(guestEmail).Count;

        var resend = await guest.PostAsJsonAsync("/api/payments/resend-verification", new { paymentIntentId = intentId });
        await AssertSuccessAsync(resend);
        Assert.Equal(firstMailCount + 1, _factory.Mail.AllTo(guestEmail).Count);

        // Повторный запрос сразу же — кулдаун 60с.
        var tooSoon = await guest.PostAsJsonAsync("/api/payments/resend-verification", new { paymentIntentId = intentId });
        Assert.Equal(HttpStatusCode.TooManyRequests, tooSoon.StatusCode);

        // Токен из ПОВТОРНОГО письма рабочий.
        var token = CapturingMailSender.ExtractToken(_factory.Mail.AllTo(guestEmail).Last(), "/api/payments/verify-delivery");
        var noRedirect = _factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var verify = await noRedirect.GetAsync($"/api/payments/verify-delivery?token={token}");
        Assert.Contains("status=ok", verify.Headers.Location!.ToString());
        Assert.Contains(poolKey, _factory.Mail.AllTo(guestEmail).Last().TextBody);
    }

    /// <summary>Состаривает заказ, будто он создан давно — для проверки 48-часового дедлайна.</summary>
    private async Task AgeOrderAsync(string paymentIntentId, TimeSpan age)
    {
        using var scope = _factory.Services.CreateScope();
        var database = scope.ServiceProvider.GetRequiredService<IMongoDatabase>();
        await database.GetCollection<BsonDocument>("Orders").UpdateOneAsync(
            Builders<BsonDocument>.Filter.Eq("PaymentIntentId", paymentIntentId),
            Builders<BsonDocument>.Update.Set("CreatedAt", DateTime.UtcNow - age));
    }

    private async Task<int> RunAutoRefundSweeperAsync()
    {
        using var scope = _factory.Services.CreateScope();
        return await scope.ServiceProvider
            .GetRequiredService<SuperBot.Infrastructure.Services.IUnverifiedOrderRefundService>()
            .RunAsync();
    }

    [Fact]
    public async Task Unverified_guest_order_is_auto_refunded_and_keys_never_leave()
    {
        // Главное требование: после авто-возврата письмо с ключами НЕ отправляется НИКОГДА,
        // даже если гость потом кликнет по старой ссылке подтверждения.
        var gameId = await SeedGameAsync(33m);
        var poolKey = $"NEVER-{Guid.NewGuid():N}"[..20].ToUpperInvariant();
        await SeedPoolKeyAsync(gameId, poolKey);

        var guestEmail = $"guest-{Guid.NewGuid():N}@taleshop.test";
        var guest = CreateClient(authenticated: false);
        var (intentId, _) = await CreateIntentAsync(guest, gameId, email: guestEmail);
        _factory.Stripe.MarkSucceeded(intentId);
        await AssertSuccessAsync(await SendWebhookAsync(guest, PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", intentId)));

        var token = CapturingMailSender.ExtractToken(_factory.Mail.LastTo(guestEmail)!, "/api/payments/verify-delivery");

        // 49 часов прошло, почта не подтверждена → sweeper возвращает деньги.
        await AgeOrderAsync(intentId, TimeSpan.FromHours(49));
        var refunded = await RunAutoRefundSweeperAsync();

        Assert.True(refunded >= 1);
        Assert.True(_factory.Stripe.RefundedIntents.ContainsKey(intentId));

        var order = await GetOrderAsync(intentId);
        Assert.Equal("REFUNDED", order!.Status);
        Assert.False(order.IsFulfilled);

        // Письмо об авто-возврате ушло.
        Assert.Contains(_factory.Mail.AllTo(guestEmail), mail => mail.Subject.Contains("refunded"));

        // Старая ссылка подтверждения БОЛЬШЕ НЕ выдаёт ключи: редирект "refunded", ключ остался в пуле.
        var noRedirect = _factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var verify = await noRedirect.GetAsync($"/api/payments/verify-delivery?token={token}");
        Assert.Contains("status=refunded", verify.Headers.Location!.ToString());

        using var scope = _factory.Services.CreateScope();
        var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();
        Assert.Empty(await keys.GetByUserAsync(guestEmail, 10));
        Assert.DoesNotContain(_factory.Mail.AllTo(guestEmail), mail => mail.TextBody.Contains(poolKey));
    }

    [Fact]
    public async Task Confirmed_or_fresh_guest_orders_are_not_auto_refunded()
    {
        var gameId = await SeedGameAsync(27m);
        await SeedPoolKeyAsync(gameId, $"KEEP-{Guid.NewGuid():N}"[..20]);

        // Заказ №1: подтверждён (и стар) — возврату не подлежит.
        var confirmedEmail = $"guest-{Guid.NewGuid():N}@taleshop.test";
        var confirmedClient = CreateClient(authenticated: false);
        var (confirmedIntent, _) = await CreateIntentAsync(confirmedClient, gameId, email: confirmedEmail);
        _factory.Stripe.MarkSucceeded(confirmedIntent);
        await AssertSuccessAsync(await SendWebhookAsync(confirmedClient, PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", confirmedIntent)));
        var token = CapturingMailSender.ExtractToken(_factory.Mail.LastTo(confirmedEmail)!, "/api/payments/verify-delivery");
        var noRedirect = _factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await noRedirect.GetAsync($"/api/payments/verify-delivery?token={token}");
        await AgeOrderAsync(confirmedIntent, TimeSpan.FromHours(60));

        // Заказ №2: не подтверждён, но СВЕЖИЙ (моложе 48ч) — ещё рано.
        var freshEmail = $"guest-{Guid.NewGuid():N}@taleshop.test";
        var freshClient = CreateClient(authenticated: false);
        var (freshIntent, _) = await CreateIntentAsync(freshClient, gameId, email: freshEmail);
        _factory.Stripe.MarkSucceeded(freshIntent);
        await AssertSuccessAsync(await SendWebhookAsync(freshClient, PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", freshIntent)));

        await RunAutoRefundSweeperAsync();

        Assert.False(_factory.Stripe.RefundedIntents.ContainsKey(confirmedIntent));
        Assert.False(_factory.Stripe.RefundedIntents.ContainsKey(freshIntent));
        Assert.True((await GetOrderAsync(confirmedIntent))!.IsFulfilled);
        Assert.Equal("PAID", (await GetOrderAsync(freshIntent))!.PaymentStatus);
    }

    [Fact]
    public async Task Verified_guest_email_skips_confirmation_on_the_next_order()
    {
        // Раз почта уже подтверждена в успешном заказе, следующий гостевой заказ на неё
        // НЕ гоняется через подтверждение — ключи выдаются сразу.
        var gameId = await SeedGameAsync(24m);
        // 1 ключ на первый заказ (qty 1) + 2 на второй (qty 2, другая цена → другой intent).
        await SeedPoolKeyAsync(gameId, $"V1-{Guid.NewGuid():N}"[..18].ToUpperInvariant());
        await SeedPoolKeyAsync(gameId, $"V2-{Guid.NewGuid():N}"[..18].ToUpperInvariant());
        await SeedPoolKeyAsync(gameId, $"V3-{Guid.NewGuid():N}"[..18].ToUpperInvariant());

        var guestEmail = $"guest-{Guid.NewGuid():N}@taleshop.test";
        var guest = CreateClient(authenticated: false);

        // --- Заказ №1: обычный путь с подтверждением почты (гейт включён) ---
        var (firstIntent, firstBody) = await CreateIntentAsync(guest, gameId, quantity: 1, email: guestEmail);
        Assert.True(firstBody.GetProperty("requiresEmailVerification").GetBoolean());
        _factory.Stripe.MarkSucceeded(firstIntent);
        await AssertSuccessAsync(await SendWebhookAsync(guest, PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", firstIntent)));

        var token = CapturingMailSender.ExtractToken(_factory.Mail.LastTo(guestEmail)!, "/api/payments/verify-delivery");
        var noRedirect = _factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var verify = await noRedirect.GetAsync($"/api/payments/verify-delivery?token={token}");
        Assert.Contains("status=ok", verify.Headers.Location!.ToString());

        // --- Заказ №2: та же почта теперь доверенная → подтверждение НЕ требуется ---
        var (secondIntent, secondBody) = await CreateIntentAsync(guest, gameId, quantity: 2, email: guestEmail);
        Assert.False(secondBody.GetProperty("requiresEmailVerification").GetBoolean());

        _factory.Stripe.MarkSucceeded(secondIntent);
        await AssertSuccessAsync(await SendWebhookAsync(guest, PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", secondIntent)));

        // Заказ №2 не держится под подтверждение и выдан сразу.
        var order = await GetOrderAsync(secondIntent);
        Assert.NotNull(order);
        Assert.False(order!.RequiresDeliveryVerification);
        Assert.True(order.IsFulfilled);
    }

    [Fact]
    public async Task Adding_duplicate_pool_keys_is_deduplicated_and_reported()
    {
        // Дубли ключей (внутри батча и против уже залитых) не попадают в пул повторно,
        // а счётчики added/skippedDuplicates честно об этом сообщают.
        var gameId = await SeedGameAsync(15m);
        var admin = _factory.CreateClient();
        admin.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "admin@taleshop.test");
        admin.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");

        var k1 = $"DUP-{Guid.NewGuid():N}"[..18].ToUpperInvariant();
        var k2 = $"UNQ-{Guid.NewGuid():N}"[..18].ToUpperInvariant();

        // Батч: k1 дважды + k2 → добавить 2, пропустить 1 (внутрибатчевый дубль).
        var first = await admin.PostAsJsonAsync($"/api/admin/keys/inventory/{gameId}",
            new { keyType = "Steam", keys = new[] { k1, k1, k2 } });
        await AssertSuccessAsync(first);
        var firstBody = await first.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(2, firstBody.GetProperty("added").GetInt32());
        Assert.Equal(1, firstBody.GetProperty("skippedDuplicates").GetInt32());

        // Второй батч: k1 (уже в пуле) + новый k3 → добавить 1, пропустить 1 (существующий дубль).
        var k3 = $"NEW-{Guid.NewGuid():N}"[..18].ToUpperInvariant();
        var second = await admin.PostAsJsonAsync($"/api/admin/keys/inventory/{gameId}",
            new { keyType = "Steam", keys = new[] { k1, k3 } });
        await AssertSuccessAsync(second);
        var secondBody = await second.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, secondBody.GetProperty("added").GetInt32());
        Assert.Equal(1, secondBody.GetProperty("skippedDuplicates").GetInt32());

        // В пуле ровно 3 уникальных ключа (k1, k2, k3).
        Assert.Equal(3, secondBody.GetProperty("available").GetInt32());
    }

    [Fact]
    public async Task Admin_key_list_shows_pool_full_delivered_masked_and_search_works()
    {
        var gameId = await SeedGameAsync(15m);
        var admin = _factory.CreateClient();
        admin.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "admin@taleshop.test");
        admin.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");

        var poolKeys = Enumerable.Range(0, 3)
            .Select(_ => $"LK-{Guid.NewGuid():N}"[..16].ToUpperInvariant())
            .ToArray();
        await AssertSuccessAsync(await admin.PostAsJsonAsync($"/api/admin/keys/inventory/{gameId}",
            new { keyType = "Steam", keys = poolKeys }));

        // Выдаём один ключ пользователю → он становится Delivered.
        const string buyer = "buyer@taleshop.test";
        var grant = await admin.PostAsJsonAsync("/api/admin/keys/grant", new { gameId, userId = buyer, keyType = "Steam" });
        await AssertSuccessAsync(grant);
        var grantedKey = (await grant.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("key").GetString()!;

        var list = await admin.GetAsync($"/api/admin/keys/inventory/{gameId}/list");
        await AssertSuccessAsync(list);
        var body = await list.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(3, body.GetProperty("total").GetInt32());
        var items = body.GetProperty("items").EnumerateArray().ToList();

        // Выданный: маска (полный ключ НЕ светится, но last-4 видны) + email покупателя.
        var delivered = items.Single(i => i.GetProperty("status").GetString() == "Delivered");
        Assert.True(delivered.GetProperty("masked").GetBoolean());
        Assert.Equal(buyer, delivered.GetProperty("ownerEmail").GetString());
        var deliveredShown = delivered.GetProperty("key").GetString()!;
        Assert.DoesNotContain(grantedKey, deliveredShown);
        Assert.EndsWith(grantedKey[^4..], deliveredShown);

        // Пуловые: показываются полностью, без маски.
        var pool = items.Where(i => i.GetProperty("status").GetString() == "Pool").ToList();
        Assert.Equal(2, pool.Count);
        Assert.All(pool, p => Assert.False(p.GetProperty("masked").GetBoolean()));

        // Поиск по полному значению оставшегося пулового ключа находит ровно его.
        var remainingPoolKey = poolKeys.First(k => k != grantedKey);
        var search = await admin.GetAsync($"/api/admin/keys/inventory/{gameId}/list?query={remainingPoolKey}");
        var searchBody = await search.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, searchBody.GetProperty("total").GetInt32());
        Assert.Equal(remainingPoolKey, searchBody.GetProperty("items")[0].GetProperty("key").GetString());
    }

    private HttpClient CreateAdminClient()
    {
        var admin = _factory.CreateClient();
        admin.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "admin@taleshop.test");
        admin.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        return admin;
    }

    private async Task<string> FirstKeyIdAsync(HttpClient admin, string gameId, string status)
    {
        var list = await admin.GetAsync($"/api/admin/keys/inventory/{gameId}/list?status={status}");
        var body = await list.Content.ReadFromJsonAsync<JsonElement>();
        return body.GetProperty("items")[0].GetProperty("id").GetString()!;
    }

    [Fact]
    public async Task Voiding_a_pool_key_removes_it_and_re_adding_the_value_warns()
    {
        var gameId = await SeedGameAsync(15m);
        var admin = CreateAdminClient();
        var key = $"VD-{Guid.NewGuid():N}"[..16].ToUpperInvariant();

        await AssertSuccessAsync(await admin.PostAsJsonAsync($"/api/admin/keys/inventory/{gameId}",
            new { keyType = "Steam", keys = new[] { key } }));
        var keyId = await FirstKeyIdAsync(admin, gameId, "pool");

        // Изымаем ключ из пула.
        await AssertSuccessAsync(await admin.PostAsync($"/api/admin/keys/inventory/{gameId}/keys/{keyId}/void", null));

        // Пул опустел; ключ виден только в истории «изъятые», замаскирован.
        var inv = await (await admin.GetAsync($"/api/admin/keys/inventory/{gameId}")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0, inv.GetProperty("available").GetInt32());
        var voided = await (await admin.GetAsync($"/api/admin/keys/inventory/{gameId}/list?status=voided")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, voided.GetProperty("total").GetInt32());
        Assert.Equal("Voided", voided.GetProperty("items")[0].GetProperty("status").GetString());

        // Повторная заливка того же значения РАЗРЕШЕНА, но с историческим предупреждением.
        var readd = await admin.PostAsJsonAsync($"/api/admin/keys/inventory/{gameId}",
            new { keyType = "Steam", keys = new[] { key } });
        await AssertSuccessAsync(readd);
        var rbody = await readd.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, rbody.GetProperty("added").GetInt32());
        Assert.Equal(1, rbody.GetProperty("previouslyVoided").GetInt32());
        Assert.Equal(1, rbody.GetProperty("available").GetInt32());
    }

    [Fact]
    public async Task Pool_key_can_be_edited_and_purged()
    {
        var gameId = await SeedGameAsync(15m);
        var admin = CreateAdminClient();
        var key = $"ED-{Guid.NewGuid():N}"[..16].ToUpperInvariant();
        var fixedKey = $"FX-{Guid.NewGuid():N}"[..16].ToUpperInvariant();

        await AssertSuccessAsync(await admin.PostAsJsonAsync($"/api/admin/keys/inventory/{gameId}",
            new { keyType = "Steam", keys = new[] { key } }));
        var keyId = await FirstKeyIdAsync(admin, gameId, "pool");

        // Правка значения (исправить опечатку).
        await AssertSuccessAsync(await admin.PutAsJsonAsync($"/api/admin/keys/inventory/{gameId}/keys/{keyId}",
            new { key = fixedKey }));
        var afterEdit = await (await admin.GetAsync($"/api/admin/keys/inventory/{gameId}/list?status=pool")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(fixedKey, afterEdit.GetProperty("items")[0].GetProperty("key").GetString());

        // Purge — жёсткое удаление, освобождает значение.
        var purge = await admin.DeleteAsync($"/api/admin/keys/inventory/{gameId}/keys/{keyId}");
        await AssertSuccessAsync(purge);
        var afterPurge = await (await admin.GetAsync($"/api/admin/keys/inventory/{gameId}/list")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0, afterPurge.GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Key_inventory_overview_reports_stock_per_game()
    {
        var admin = CreateAdminClient();
        var stocked = await SeedGameAsync(15m);
        var empty = await SeedGameAsync(20m); // ключей не заливаем — «нет в наличии»

        var keys = Enumerable.Range(0, 3).Select(_ => $"OV-{Guid.NewGuid():N}"[..16].ToUpperInvariant()).ToArray();
        await AssertSuccessAsync(await admin.PostAsJsonAsync($"/api/admin/keys/inventory/{stocked}",
            new { keyType = "Steam", keys }));
        await AssertSuccessAsync(await admin.PostAsJsonAsync("/api/admin/keys/grant",
            new { gameId = stocked, userId = "b@taleshop.test" }));

        var resp = await admin.GetAsync("/api/admin/keys/overview?lowThreshold=2");
        await AssertSuccessAsync(resp);
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        var rows = body.GetProperty("games").EnumerateArray().ToList();

        // Игра с ключами: 2 доступно, 1 выдан, помечена «мало» (2 ≤ 2), не пустая.
        var stockedRow = rows.Single(r => r.GetProperty("gameId").GetString() == stocked);
        Assert.Equal(2, stockedRow.GetProperty("available").GetInt32());
        Assert.Equal(1, stockedRow.GetProperty("delivered").GetInt32());
        Assert.True(stockedRow.GetProperty("low").GetBoolean());
        Assert.False(stockedRow.GetProperty("outOfStock").GetBoolean());

        // Игра без ключей: пусто.
        var emptyRow = rows.Single(r => r.GetProperty("gameId").GetString() == empty);
        Assert.Equal(0, emptyRow.GetProperty("available").GetInt32());
        Assert.True(emptyRow.GetProperty("outOfStock").GetBoolean());

        Assert.True(body.GetProperty("totals").GetProperty("games").GetInt32() >= 2);
    }

    [Fact]
    public async Task Overview_counts_owed_keys_when_a_paid_order_had_no_stock()
    {
        // Клиент оплатил, а ключа не было (пул пуст, не гость-верификация) → заказ ждёт ключа.
        var gameId = await SeedGameAsync(30m); // ключи НЕ заливаем
        var buyer = CreateClient(); // авторизован → не под верификацией почты
        var (intentId, _) = await CreateIntentAsync(buyer, gameId);
        _factory.Stripe.MarkSucceeded(intentId);
        await AssertSuccessAsync(await SendWebhookAsync(CreateClient(authenticated: false),
            PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", intentId)));

        var order = await GetOrderAsync(intentId);
        Assert.True(order!.IsPaid);
        Assert.False(order.IsFulfilled);

        var admin = CreateAdminClient();
        var body = await (await admin.GetAsync("/api/admin/keys/overview")).Content.ReadFromJsonAsync<JsonElement>();
        var row = body.GetProperty("games").EnumerateArray().Single(r => r.GetProperty("gameId").GetString() == gameId);
        Assert.Equal(1, row.GetProperty("awaiting").GetInt32());
        Assert.True(body.GetProperty("totals").GetProperty("awaiting").GetInt32() >= 1);
    }

    [Fact]
    public async Task Partial_delivery_email_says_partial_and_lists_pending()
    {
        // Заказ на 2 ключа, в пуле только 1 → выдаётся 1, письмо честно пишет «часть заказа» + что ещё в пути.
        var gameId = await SeedGameAsync(20m);
        await SeedPoolKeyAsync(gameId, $"P1-{Guid.NewGuid():N}"[..16].ToUpperInvariant());

        var buyer = $"partial-{Guid.NewGuid():N}@taleshop.test";
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, buyer);
        client.DefaultRequestHeaders.Add(TestAuthHandler.SubHeader, $"u-{Guid.NewGuid():N}");

        var (intentId, _) = await CreateIntentAsync(client, gameId, quantity: 2);
        _factory.Stripe.MarkSucceeded(intentId);
        await AssertSuccessAsync(await SendWebhookAsync(CreateClient(authenticated: false),
            PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", intentId)));

        var order = await GetOrderAsync(intentId);
        Assert.False(order!.IsFulfilled); // выдан 1 из 2

        var mail = _factory.Mail.AllTo(buyer).Last();
        Assert.Contains("Part of your order", mail.Subject);
        Assert.Contains("1 of 2", mail.TextBody);
        Assert.Contains("Still on the way", mail.TextBody);
    }

    [Fact]
    public async Task Owed_endpoint_lists_who_is_waiting_for_keys()
    {
        var gameId = await SeedGameAsync(30m); // ключей нет
        var buyer = $"waiting-{Guid.NewGuid():N}@taleshop.test";
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, buyer);
        client.DefaultRequestHeaders.Add(TestAuthHandler.SubHeader, $"u-{Guid.NewGuid():N}");

        var (intentId, _) = await CreateIntentAsync(client, gameId);
        _factory.Stripe.MarkSucceeded(intentId);
        await AssertSuccessAsync(await SendWebhookAsync(CreateClient(authenticated: false),
            PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", intentId)));

        var admin = CreateAdminClient();
        var body = await (await admin.GetAsync("/api/admin/keys/owed")).Content.ReadFromJsonAsync<JsonElement>();
        var line = body.GetProperty("lines").EnumerateArray()
            .Single(l => l.GetProperty("buyerEmail").GetString() == buyer);
        Assert.Equal(gameId, line.GetProperty("gameId").GetString());
        Assert.Equal(1, line.GetProperty("remaining").GetInt32());
        Assert.False(string.IsNullOrEmpty(line.GetProperty("orderNumber").GetString()));
    }

    [Fact]
    public async Task Email_logo_asset_is_served_by_the_backend()
    {
        // Логотип писем раздаёт сам бэкенд (embedded-ресурс) — письмо не зависит от деплоя фронта.
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/email-assets/logo");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("image/png", response.Content.Headers.ContentType?.MediaType);
        var bytes = await response.Content.ReadAsByteArrayAsync();
        Assert.True(bytes.Length > 1000, "PNG-логотип должен быть непустым");
    }

    [Fact]
    public async Task Verify_delivery_with_forged_token_is_rejected()
    {
        var noRedirect = _factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });

        var verify = await noRedirect.GetAsync("/api/payments/verify-delivery?token=deadbeef00");

        Assert.Equal(HttpStatusCode.Redirect, verify.StatusCode);
        Assert.Contains("status=invalid", verify.Headers.Location!.ToString());
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
