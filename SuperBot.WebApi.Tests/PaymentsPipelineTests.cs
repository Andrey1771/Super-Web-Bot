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

    /// <summary>
    /// Название игры по её id. Обзор запасов отдаёт страницу с поиском, поэтому тест спрашивает
    /// свою игру по имени, а не перебирает весь каталог.
    /// </summary>
    private async Task<string> TitleOfAsync(string gameId)
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var game = await games.GetByIdAsync(gameId);
        return game?.Title ?? game?.Name ?? string.Empty;
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

        // Снимок каталога кэшируется на две минуты, а игру мы завели мимо API. В жизни его
        // сбрасывает сохранение из админки; здесь делаем это руками, иначе складской обзор
        // ещё не знает о новой игре.
        scope.ServiceProvider.GetRequiredService<SuperBot.WebApi.Services.ICatalogSnapshotService>().Invalidate();

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

        // Обе игры заведены с общим префиксом «Test Game», поэтому берём их одним поиском.
        var resp = await admin.GetAsync("/api/admin/keys/overview?lowThreshold=2&status=all&pageSize=100&query=" + Uri.EscapeDataString(await TitleOfAsync(stocked)));
        await AssertSuccessAsync(resp);
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        var rows = body.GetProperty("games").EnumerateArray().ToList();

        var emptyResp = await admin.GetAsync("/api/admin/keys/overview?lowThreshold=2&status=all&pageSize=100&query=" + Uri.EscapeDataString(await TitleOfAsync(empty)));
        await AssertSuccessAsync(emptyResp);
        var emptyBody = await emptyResp.Content.ReadFromJsonAsync<JsonElement>();
        rows = rows.Concat(emptyBody.GetProperty("games").EnumerateArray()).ToList();

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
        var body = await (await admin.GetAsync("/api/admin/keys/overview?status=all&pageSize=100&query=" + Uri.EscapeDataString(await TitleOfAsync(gameId)))).Content.ReadFromJsonAsync<JsonElement>();
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
        // Кэшбэк начисляется только за полностью выданный заказ — в письме о части его нет.
        Assert.DoesNotContain("Cashback", mail.TextBody);
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

    // ---------- кэшбэк ----------

    private async Task<SuperBot.Core.Cashback.CashbackSummary> CashbackOfAsync(string userKey)
    {
        using var scope = _factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SuperBot.Core.Cashback.ICashbackLedger>().GetSummaryAsync(userKey);
    }

    /// <summary>Вошедший покупатель оплатил заказ, ключ был на складе — заказ выдан.</summary>
    private async Task<string> PaidDeliveredOrderAsync(decimal price)
    {
        var gameId = await SeedGameAsync(price);
        await SeedPoolKeyAsync(gameId, $"CB-{Guid.NewGuid():N}"[..20].ToUpperInvariant());
        var client = CreateClient();
        var (intentId, _) = await CreateIntentAsync(client, gameId);
        _factory.Stripe.MarkSucceeded(intentId);
        await AssertSuccessAsync(await SendWebhookAsync(CreateClient(authenticated: false), PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", intentId)));
        Assert.True((await GetOrderAsync(intentId))!.IsFulfilled);
        return intentId;
    }

    [Fact]
    public async Task Delivered_order_of_a_signed_in_buyer_earns_pending_cashback()
    {
        await PaidDeliveredOrderAsync(20m);

        var cashback = await CashbackOfAsync(_userEmail);
        Assert.Equal(0.60m, cashback.PendingUsd);   // 3% Rookie, ждёт 14 дней
        Assert.Equal(0m, cashback.AvailableUsd);
        Assert.Equal(20m, cashback.QualifyingSpendUsd);
    }

    [Fact]
    public async Task Keys_email_says_how_much_cashback_the_order_earned_and_when_it_can_be_spent()
    {
        var intentId = await PaidDeliveredOrderAsync(20m);
        var order = await GetOrderAsync(intentId);

        var mail = _factory.Mail.AllTo(_userEmail).Last(item => item.Subject.Contains(order!.OrderNumber!));
        var unlocks = DateTime.UtcNow.AddDays(14).ToString("d MMMM yyyy", System.Globalization.CultureInfo.InvariantCulture);
        Assert.Contains($"Cashback: +$0.60 (3%) is on its way to your balance and can be spent from {unlocks}.", mail.TextBody);
        Assert.Contains("Cashback earned", mail.HtmlBody);
        Assert.Contains("/account/rewards", mail.HtmlBody);
    }

    [Fact]
    public async Task Keys_email_of_a_guest_order_has_no_cashback()
    {
        // Гость с уже подтверждённой почтой получает ключи сразу, но кэшбэк гостевым заказам не начисляется.
        var guest = $"guest-{Guid.NewGuid():N}@taleshop.test";
        var gameId = await SeedGameAsync(20m);
        await SeedPoolKeyAsync(gameId, $"G1-{Guid.NewGuid():N}"[..16].ToUpperInvariant());
        var (intentId, _) = await CreateIntentAsync(CreateClient(authenticated: false), gameId, email: guest);
        _factory.Stripe.MarkSucceeded(intentId);
        await AssertSuccessAsync(await SendWebhookAsync(CreateClient(authenticated: false), PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", intentId)));

        // Ключи гостю придержаны до подтверждения почты — подтверждаем ссылкой из письма.
        var verification = _factory.Mail.LastTo(guest)!;
        var token = CapturingMailSender.ExtractToken(verification, "/api/payments/verify-delivery");
        await CreateClient(authenticated: false).GetAsync($"/api/payments/verify-delivery?token={token}");

        var keys = _factory.Mail.AllTo(guest).Last();
        Assert.StartsWith("Your game keys", keys.Subject);
        Assert.DoesNotContain("Cashback", keys.TextBody);
    }

    private async Task GiveCashbackAsync(string userKey, decimal usd)
    {
        using var scope = _factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<SuperBot.Core.Cashback.ICashbackLedger>()
            .AdjustAsync(userKey, usd, "test balance", "test");
    }

    private async Task<(string IntentId, JsonElement Body)> CreateIntentWithCashbackAsync(HttpClient client, string gameId, bool useCashback, string? email = null)
    {
        var response = await client.PostAsJsonAsync("/api/payments/create-payment-intent", new
        {
            items = new[] { new { gameId, quantity = 1 } },
            useCashback,
            email
        });
        await AssertSuccessAsync(response);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var secret = body.GetProperty("clientSecret").GetString()!;
        return (secret[..secret.IndexOf("_secret", StringComparison.Ordinal)], body);
    }

    [Fact]
    public async Task Paying_with_cashback_lowers_the_card_charge_and_writes_the_balance_off()
    {
        await GiveCashbackAsync(_userEmail, 10m);
        var gameId = await SeedGameAsync(20m);
        await SeedPoolKeyAsync(gameId, $"CB-{Guid.NewGuid():N}"[..20].ToUpperInvariant());
        var client = CreateClient();

        var (intentId, body) = await CreateIntentWithCashbackAsync(client, gameId, useCashback: true);
        var totals = body.GetProperty("totals");
        Assert.Equal(10m, totals.GetProperty("cashback").GetDecimal());
        Assert.Equal(10m, totals.GetProperty("total").GetDecimal());
        Assert.Equal(10m, body.GetProperty("cashback").GetProperty("available").GetDecimal());
        Assert.Equal(1000, (await _factory.Stripe.GetAsync(intentId))!.Amount);   // картой — только $10
        Assert.Equal(10m, (await CashbackOfAsync(_userEmail)).ReservedUsd);

        _factory.Stripe.MarkSucceeded(intentId);
        await AssertSuccessAsync(await SendWebhookAsync(CreateClient(authenticated: false), PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", intentId)));

        var order = await GetOrderAsync(intentId);
        Assert.Equal(10m, order!.CashbackApplied);
        Assert.Equal(10m, order.TotalAmount);
        Assert.Equal(10m, order.Totals.Total);

        var cashback = await CashbackOfAsync(_userEmail);
        Assert.Equal(0m, cashback.AvailableUsd);
        Assert.Equal(0m, cashback.ReservedUsd);
        Assert.Equal(10m, cashback.UsedAllTimeUsd);
        Assert.Equal(0.30m, cashback.PendingUsd);   // 3% только с оплаченных картой $10

        // Страница заказа в кабинете показывает и оплаченное кэшбэком, и начисленное за заказ.
        var details = await client.GetAsync($"/api/account/orders/{order.Id}");
        await AssertSuccessAsync(details);
        var detailsBody = await details.Content.ReadFromJsonAsync<JsonElement>();
        var orderCashback = detailsBody.GetProperty("cashback");
        Assert.Equal(10m, orderCashback.GetProperty("applied").GetDecimal());
        Assert.Equal(0.30m, orderCashback.GetProperty("earned").GetDecimal());
        Assert.Equal("pending", orderCashback.GetProperty("earnedStatus").GetString());
        Assert.Equal(3m, orderCashback.GetProperty("percent").GetDecimal());
        Assert.Equal(10m, detailsBody.GetProperty("totals").GetProperty("total").GetDecimal());
    }

    [Fact]
    public async Task Cashback_never_covers_the_minimum_card_payment()
    {
        await GiveCashbackAsync(_userEmail, 50m);
        var gameId = await SeedGameAsync(20m);

        var (intentId, body) = await CreateIntentWithCashbackAsync(CreateClient(), gameId, useCashback: true);

        // Минимум на карту — $1: ниже него комиссия Stripe съедает заметную часть платежа.
        Assert.Equal(19.00m, body.GetProperty("totals").GetProperty("cashback").GetDecimal());
        Assert.Equal(1.00m, body.GetProperty("totals").GetProperty("total").GetDecimal());
        Assert.Equal(100, (await _factory.Stripe.GetAsync(intentId))!.Amount);
    }

    [Fact]
    public async Task Card_minimum_is_raised_when_the_Stripe_account_currency_is_unknown()
    {
        // Валюта выплат аккаунта неизвестна (Stripe не ответил) — порог Stripe двойной: у аккаунта в евро ровно $0.50
        // отклоняется. Настройку «минимум на карту» обнуляем, чтобы проверить именно порог Stripe.
        await GiveCashbackAsync(_userEmail, 50m);
        var gameId = await SeedGameAsync(20m);
        var admin = _factory.CreateClient();
        admin.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "admin@taleshop.test");
        admin.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        await AssertSuccessAsync(await admin.PutAsJsonAsync("/api/admin/cashback/settings", new { minCardPaymentUsd = 0m }));
        _factory.Stripe.SettlementCurrency = null;
        try
        {
            var (intentId, body) = await CreateIntentWithCashbackAsync(CreateClient(), gameId, useCashback: true);

            Assert.Equal(19.00m, body.GetProperty("totals").GetProperty("cashback").GetDecimal());
            Assert.Equal(1.00m, body.GetProperty("totals").GetProperty("total").GetDecimal());
            Assert.Equal(100, (await _factory.Stripe.GetAsync(intentId))!.Amount);
        }
        finally
        {
            _factory.Stripe.SettlementCurrency = "USD";
            await admin.PutAsJsonAsync("/api/admin/cashback/settings", new { });
        }
    }

    [Fact]
    public async Task Overlapping_checkout_requests_all_see_the_same_cashback()
    {
        // Касса шлёт запрос на каждое изменение, и они приходят внахлёст. Раньше второй запрос, пришедший до записи
        // намерения первым, видел кэшбэк уже отложенным и отвечал «0» — сумма на экране мигала.
        await GiveCashbackAsync(_userEmail, 10m);
        var gameId = await SeedGameAsync(20m);
        var client = CreateClient();

        var results = await Task.WhenAll(Enumerable.Range(0, 6)
            .Select(_ => CreateIntentWithCashbackAsync(client, gameId, useCashback: true)));

        Assert.All(results, result => Assert.Equal(10m, result.Body.GetProperty("totals").GetProperty("cashback").GetDecimal()));
        Assert.Single(results.Select(result => result.IntentId).Distinct());
        var cashback = await CashbackOfAsync(_userEmail);
        Assert.Equal(10m, cashback.ReservedUsd);                                   // отложено один раз, не шесть
        Assert.Equal(0m, cashback.AvailableUsd);
    }

    [Fact]
    public async Task Switching_cashback_off_releases_the_reservation()
    {
        await GiveCashbackAsync(_userEmail, 10m);
        var gameId = await SeedGameAsync(20m);
        var client = CreateClient();

        var (first, _) = await CreateIntentWithCashbackAsync(client, gameId, useCashback: true);
        Assert.Equal(10m, (await CashbackOfAsync(_userEmail)).ReservedUsd);

        var (second, body) = await CreateIntentWithCashbackAsync(client, gameId, useCashback: false);
        Assert.Equal(first, second);                                               // то же намерение
        Assert.Equal(0m, body.GetProperty("totals").GetProperty("cashback").GetDecimal());
        Assert.Equal(2000, (await _factory.Stripe.GetAsync(second))!.Amount);

        var cashback = await CashbackOfAsync(_userEmail);
        Assert.Equal(10m, cashback.AvailableUsd);
        Assert.Equal(0m, cashback.ReservedUsd);
    }

    [Fact]
    public async Task Refund_of_an_order_paid_with_cashback_returns_the_cashback()
    {
        await GiveCashbackAsync(_userEmail, 10m);
        var gameId = await SeedGameAsync(20m);
        await SeedPoolKeyAsync(gameId, $"CB-{Guid.NewGuid():N}"[..20].ToUpperInvariant());
        var (intentId, _) = await CreateIntentWithCashbackAsync(CreateClient(), gameId, useCashback: true);
        _factory.Stripe.MarkSucceeded(intentId);
        var anonymous = CreateClient(authenticated: false);
        await AssertSuccessAsync(await SendWebhookAsync(anonymous, PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", intentId)));

        await AssertSuccessAsync(await SendWebhookAsync(anonymous,
            ChargeRefundedPayload($"evt_{Guid.NewGuid():N}", intentId, amount: 1000, refunded: 1000)));

        var cashback = await CashbackOfAsync(_userEmail);
        Assert.Equal(10m, cashback.AvailableUsd);   // потраченное вернулось
        Assert.Equal(0m, cashback.PendingUsd);      // начисленное за заказ забрано
        Assert.Equal(0m, cashback.UsedAllTimeUsd);
    }

    [Fact]
    public async Task Guests_cannot_pay_with_cashback()
    {
        var guestEmail = $"guest-{Guid.NewGuid():N}@taleshop.test";
        await GiveCashbackAsync(guestEmail, 10m);
        var gameId = await SeedGameAsync(20m);

        var (intentId, body) = await CreateIntentWithCashbackAsync(CreateClient(authenticated: false), gameId, useCashback: true, email: guestEmail);

        Assert.Equal(0m, body.GetProperty("totals").GetProperty("cashback").GetDecimal());
        Assert.Equal(2000, (await _factory.Stripe.GetAsync(intentId))!.Amount);
    }

    [Fact]
    public async Task Hourly_sync_releases_an_abandoned_reservation()
    {
        await GiveCashbackAsync(_userEmail, 10m);
        using (var scope = _factory.Services.CreateScope())
        {
            var ledger = scope.ServiceProvider.GetRequiredService<SuperBot.Core.Cashback.ICashbackLedger>();
            await ledger.ReserveAsync(_userEmail, $"chk_{Guid.NewGuid():N}", 6m);
            // Резерв «забыт» два часа назад: процесс упал до создания платежа.
            await scope.ServiceProvider.GetRequiredService<IMongoDatabase>()
                .GetCollection<BsonDocument>("CashbackEntries")
                .UpdateManyAsync(
                    Builders<BsonDocument>.Filter.And(
                        Builders<BsonDocument>.Filter.Eq("UserKey", _userEmail),
                        Builders<BsonDocument>.Filter.Eq("Status", "reserved")),
                    Builders<BsonDocument>.Update.Set("UpdatedAt", DateTime.UtcNow.AddHours(-2)));
        }
        Assert.Equal(4m, (await CashbackOfAsync(_userEmail)).AvailableUsd);

        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<SuperBot.Infrastructure.Services.ICashbackSyncService>().RunAsync();
        }

        var cashback = await CashbackOfAsync(_userEmail);
        Assert.Equal(10m, cashback.AvailableUsd);
        Assert.Equal(0m, cashback.ReservedUsd);
    }

    [Fact]
    public async Task Account_cashback_endpoint_shows_balance_level_and_history()
    {
        var intentId = await PaidDeliveredOrderAsync(20m);
        var order = await GetOrderAsync(intentId);

        var response = await CreateClient().GetAsync("/api/account/cashback?currency=USD");
        await AssertSuccessAsync(response);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.True(body.GetProperty("enabled").GetBoolean());
        Assert.Equal("USD", body.GetProperty("currency").GetString());
        Assert.Equal(0.60m, body.GetProperty("pending").GetDecimal());
        Assert.Equal(0m, body.GetProperty("available").GetDecimal());
        Assert.Equal(20m, body.GetProperty("totalSpent").GetDecimal());
        Assert.Equal("rookie", body.GetProperty("tier").GetProperty("id").GetString());
        Assert.Equal("veteran", body.GetProperty("nextTier").GetProperty("id").GetString());
        Assert.Equal(180m, body.GetProperty("remainingToNextTier").GetDecimal());

        var row = body.GetProperty("history").EnumerateArray().Single();
        Assert.Equal("earn", row.GetProperty("type").GetString());
        Assert.Equal("pending", row.GetProperty("status").GetString());
        Assert.Equal(0.60m, row.GetProperty("amount").GetDecimal());
        Assert.Equal(order!.OrderNumber, row.GetProperty("orderNumber").GetString());
        Assert.False(string.IsNullOrWhiteSpace(row.GetProperty("gameTitle").GetString()));
        Assert.NotEqual(JsonValueKind.Null, row.GetProperty("unlocksAt").ValueKind);
    }

    [Fact]
    public async Task Account_cashback_requires_sign_in_and_program_is_public()
    {
        var anonymous = CreateClient(authenticated: false);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/account/cashback")).StatusCode);

        var program = await anonymous.GetAsync("/api/cashback/program?currency=USD");
        await AssertSuccessAsync(program);
        var body = await program.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(14, body.GetProperty("pendingDays").GetInt32());
        Assert.Equal(1.00m, body.GetProperty("minCardPayment").GetDecimal());
        var tiers = body.GetProperty("tiers").EnumerateArray().ToList();
        Assert.Equal(new[] { "rookie", "veteran", "elite", "legend" }, tiers.Select(t => t.GetProperty("id").GetString()));
        Assert.Equal(JsonValueKind.Null, tiers[0].GetProperty("spendThreshold").ValueKind);
        Assert.Equal(3000m, tiers[3].GetProperty("spendThreshold").GetDecimal());
    }

    [Fact]
    public async Task Guest_orders_are_marked_and_never_earn()
    {
        var gameId = await SeedGameAsync(30m);
        var guestEmail = $"guest-{Guid.NewGuid():N}@taleshop.test";
        var guest = CreateClient(authenticated: false);
        var (intentId, _) = await CreateIntentAsync(guest, gameId, email: guestEmail);
        _factory.Stripe.MarkSucceeded(intentId);
        await AssertSuccessAsync(await SendWebhookAsync(guest, PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", intentId)));

        var order = await GetOrderAsync(intentId);
        Assert.True(order!.PlacedAsGuest);

        // Даже если заказ выдан (как после подтверждения почты) — кэшбэка у гостя нет.
        order.IsFulfilled = true;
        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<SuperBot.Infrastructure.Services.ICashbackOrderEvents>().SyncOrderAsync(order);
        }
        Assert.Equal(0m, (await CashbackOfAsync(guestEmail)).PendingUsd);
    }

    [Fact]
    public async Task Refund_after_delivery_takes_the_cashback_back()
    {
        var intentId = await PaidDeliveredOrderAsync(20m);
        Assert.Equal(0.60m, (await CashbackOfAsync(_userEmail)).PendingUsd);

        await AssertSuccessAsync(await SendWebhookAsync(CreateClient(authenticated: false),
            ChargeRefundedPayload($"evt_{Guid.NewGuid():N}", intentId, amount: 2000, refunded: 2000)));

        var cashback = await CashbackOfAsync(_userEmail);
        Assert.Equal(0m, cashback.PendingUsd);
        Assert.Equal(0m, cashback.EarnedAllTimeUsd);
        Assert.Equal(0m, cashback.QualifyingSpendUsd);
    }

    [Fact]
    public async Task Partial_refund_takes_back_a_proportional_part_of_the_cashback()
    {
        var intentId = await PaidDeliveredOrderAsync(40m);
        Assert.Equal(1.20m, (await CashbackOfAsync(_userEmail)).PendingUsd);

        await AssertSuccessAsync(await SendWebhookAsync(CreateClient(authenticated: false),
            ChargeRefundedPayload($"evt_{Guid.NewGuid():N}", intentId, amount: 4000, refunded: 1000)));

        Assert.Equal(0.90m, (await CashbackOfAsync(_userEmail)).PendingUsd);
    }

    [Fact]
    public async Task Admin_refund_takes_the_cashback_back()
    {
        var intentId = await PaidDeliveredOrderAsync(20m);
        var order = await GetOrderAsync(intentId);

        var admin = _factory.CreateClient();
        admin.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "admin@taleshop.test");
        admin.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        await AssertSuccessAsync(await admin.PostAsJsonAsync($"/api/admin/orders/{order!.Id}/refund", new { reason = "test" }));

        Assert.Equal(0m, (await CashbackOfAsync(_userEmail)).PendingUsd);
    }

    [Fact]
    public async Task Cashback_arrives_when_a_restock_completes_an_awaiting_order()
    {
        var gameId = await SeedGameAsync(50m);
        var client = CreateClient();
        var (intentId, _) = await CreateIntentAsync(client, gameId);
        _factory.Stripe.MarkSucceeded(intentId);
        await AssertSuccessAsync(await SendWebhookAsync(CreateClient(authenticated: false), PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", intentId)));
        Assert.Equal(0m, (await CashbackOfAsync(_userEmail)).PendingUsd); // ключей нет — не выдан, не начислено

        using (var scope = _factory.Services.CreateScope())
        {
            await SeedPoolKeyAsync(gameId, $"CB-{Guid.NewGuid():N}"[..20].ToUpperInvariant());
            await scope.ServiceProvider.GetRequiredService<SuperBot.Core.Interfaces.IKeyFulfillmentService>().BackfillGameAsync(gameId);
        }

        Assert.Equal(1.50m, (await CashbackOfAsync(_userEmail)).PendingUsd);
    }

    [Fact]
    public async Task Hourly_sync_catches_up_a_delivered_order_whose_hook_did_not_run()
    {
        var gameId = await SeedGameAsync(10m);
        var client = CreateClient();
        var (intentId, _) = await CreateIntentAsync(client, gameId);
        _factory.Stripe.MarkSucceeded(intentId);
        await AssertSuccessAsync(await SendWebhookAsync(CreateClient(authenticated: false), PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", intentId)));

        // Выдали «мимо» выдачи ключей — как если бы процесс упал до хука.
        using (var scope = _factory.Services.CreateScope())
        {
            var orders = scope.ServiceProvider.GetRequiredService<IOrderRepository>();
            var order = await orders.GetByPaymentIntentIdAsync(intentId);
            order!.IsFulfilled = true;
            order.FulfillmentStatus = "DELIVERED";
            order.Status = "DELIVERED";
            await orders.UpdateOrderAsync(order);
        }
        Assert.Equal(0m, (await CashbackOfAsync(_userEmail)).PendingUsd);

        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<SuperBot.Infrastructure.Services.ICashbackSyncService>().RunAsync();
        }
        Assert.Equal(0.30m, (await CashbackOfAsync(_userEmail)).PendingUsd);
    }

    [Fact]
    public async Task Dispute_takes_the_cashback_back()
    {
        var intentId = await PaidDeliveredOrderAsync(20m);

        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<SuperBot.Infrastructure.Services.IPaymentReconciliationService>()
                .ApplyDisputeAsync(new SuperBot.Infrastructure.Services.DisputeNotice
                {
                    PaymentIntentId = intentId,
                    DisputeId = "dp_test",
                    AmountMinor = 2000,
                    Currency = "usd"
                });
        }

        Assert.Equal(0m, (await CashbackOfAsync(_userEmail)).PendingUsd);
    }

    // ---------- споры по оплате ----------

    private static string DisputePayload(string type, string paymentIntentId, string disputeId, string status, long amount, DateTime? dueBy = null, bool hasEvidence = false) =>
        BuildEventPayload($"evt_{Guid.NewGuid():N}", type, new Stripe.Dispute
        {
            Id = disputeId,
            Object = "dispute",
            PaymentIntentId = paymentIntentId,
            Amount = amount,
            Currency = "usd",
            Status = status,
            Reason = "fraudulent",
            EvidenceDetails = new Stripe.DisputeEvidenceDetails { DueBy = dueBy, HasEvidence = hasEvidence }
        });

    private async Task<BsonDocument?> PaymentIssueAsync(string paymentIntentId)
    {
        using var scope = _factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<IMongoDatabase>().GetCollection<BsonDocument>("PaymentFinalizationFailures")
            .Find(Builders<BsonDocument>.Filter.Eq("PaymentIntentId", paymentIntentId)).FirstOrDefaultAsync();
    }

    [Fact]
    public async Task Open_dispute_shows_the_evidence_deadline_on_the_order_and_in_payment_issues()
    {
        var intentId = await PaidDeliveredOrderAsync(20m);
        var anonymous = CreateClient(authenticated: false);
        var disputeId = $"dp_{Guid.NewGuid():N}";
        var due = new DateTime(2026, 10, 1, 23, 59, 0, DateTimeKind.Utc);

        await AssertSuccessAsync(await SendWebhookAsync(anonymous, DisputePayload("charge.dispute.created", intentId, disputeId, "needs_response", 2000, due)));

        var order = await GetOrderAsync(intentId);
        Assert.Equal("DISPUTED", order!.PaymentStatus);
        Assert.Equal("needs_response", order.Dispute!.Status);
        Assert.Equal(due, order.Dispute.EvidenceDueBy);
        Assert.Null(order.Dispute.Outcome);
        var issue = await PaymentIssueAsync(intentId);
        Assert.Equal("PAYMENT_DISPUTED", issue!["ErrorCode"].AsString);
        Assert.Contains("Submit evidence in Stripe by 2026-10-01 23:59 UTC", issue["ErrorMessage"].AsString);

        // Доказательства отправлены — срок из сообщения уходит, спор ждёт банк.
        await AssertSuccessAsync(await SendWebhookAsync(anonymous, DisputePayload("charge.dispute.updated", intentId, disputeId, "under_review", 2000, due, hasEvidence: true)));
        order = await GetOrderAsync(intentId);
        Assert.Equal("under_review", order!.Dispute!.Status);
        Assert.True(order.Dispute.HasEvidence);
        Assert.Contains("Evidence submitted", (await PaymentIssueAsync(intentId))!["ErrorMessage"].AsString);

        // В карточке заказа админки — тот же спор со сроком.
        var admin = _factory.CreateClient();
        admin.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "owner@taleshop.test");
        admin.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        var card = await (await admin.GetAsync($"/api/admin/orders/{order.Id}")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("under_review", card.GetProperty("dispute").GetProperty("status").GetString());
        Assert.StartsWith("2026-10-01T23:59:00", card.GetProperty("dispute").GetProperty("evidenceDueBy").GetString());
    }

    [Fact]
    public async Task Won_dispute_makes_the_order_paid_again_and_gives_the_cashback_back()
    {
        var intentId = await PaidDeliveredOrderAsync(20m);
        var anonymous = CreateClient(authenticated: false);
        var disputeId = $"dp_{Guid.NewGuid():N}";

        await AssertSuccessAsync(await SendWebhookAsync(anonymous, DisputePayload("charge.dispute.created", intentId, disputeId, "needs_response", 2000)));
        Assert.Equal(0m, (await CashbackOfAsync(_userEmail)).PendingUsd);

        await AssertSuccessAsync(await SendWebhookAsync(anonymous, DisputePayload("charge.dispute.closed", intentId, disputeId, "won", 2000)));

        var order = await GetOrderAsync(intentId);
        Assert.Equal("PAID", order!.PaymentStatus);
        Assert.Equal("won", order.Dispute!.Outcome);
        var cashback = await CashbackOfAsync(_userEmail);
        Assert.Equal(0.60m, cashback.PendingUsd);          // начисление снова на месте
        Assert.Equal(20m, cashback.QualifyingSpendUsd);    // и сумма покупок для уровня
        Assert.Equal("Resolved", (await PaymentIssueAsync(intentId))!["Status"].AsString);

        // Запоздавшее «needs_response» по закрытому спору его не открывает, повтор закрытия ничего не удваивает.
        await AssertSuccessAsync(await SendWebhookAsync(anonymous, DisputePayload("charge.dispute.updated", intentId, disputeId, "needs_response", 2000)));
        await AssertSuccessAsync(await SendWebhookAsync(anonymous, DisputePayload("charge.dispute.closed", intentId, disputeId, "won", 2000)));
        Assert.Equal("PAID", (await GetOrderAsync(intentId))!.PaymentStatus);
        Assert.Equal(0.60m, (await CashbackOfAsync(_userEmail)).PendingUsd);
    }

    [Fact]
    public async Task Lost_dispute_counts_as_a_refund_returns_spent_cashback_and_reverses_the_tax()
    {
        await GiveCashbackAsync(_userEmail, 10m);
        var gameId = await SeedGameAsync(20m);
        await SeedPoolKeyAsync(gameId, $"DL-{Guid.NewGuid():N}"[..20].ToUpperInvariant());
        var client = CreateClient();
        client.DefaultRequestHeaders.Add("X-Buyer-Country", "DE");
        var (intentId, _) = await CreateIntentWithCashbackAsync(client, gameId, useCashback: true);
        _factory.Stripe.MarkSucceeded(intentId, billingCountry: "DE");
        var anonymous = CreateClient(authenticated: false);
        await AssertSuccessAsync(await SendWebhookAsync(anonymous, PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", intentId)));
        var disputeId = $"dp_{Guid.NewGuid():N}";

        // Картой заплачено $10 — спорят на $10.
        await AssertSuccessAsync(await SendWebhookAsync(anonymous, DisputePayload("charge.dispute.created", intentId, disputeId, "needs_response", 1000)));
        await AssertSuccessAsync(await SendWebhookAsync(anonymous, DisputePayload("charge.dispute.closed", intentId, disputeId, "lost", 1000)));

        var order = await GetOrderAsync(intentId);
        Assert.Equal("DISPUTE_LOST", order!.PaymentStatus);
        Assert.Equal("REFUNDED", order.Status);
        Assert.Equal(10m, order.RefundedAmount);
        Assert.Equal("lost", order.Dispute!.Outcome);

        var cashback = await CashbackOfAsync(_userEmail);
        Assert.Equal(10m, cashback.AvailableUsd);   // оплата кэшбэком отменена — он снова на балансе
        Assert.Equal(0m, cashback.PendingUsd);      // начисленное за заказ забрано
        Assert.Single(_factory.StripeTax.Reversals, item => item.Reference.StartsWith(intentId, StringComparison.Ordinal) && item.Full);

        var issue = await PaymentIssueAsync(intentId);
        Assert.Equal("DISPUTE_LOST", issue!["ErrorCode"].AsString);
        Assert.Equal("Open", issue["Status"].AsString);
    }

    [Fact]
    public async Task Order_remembers_the_site_language_and_the_keys_email_is_sent_in_it()
    {
        // Покупатель смотрел сайт по-русски: язык уходит заголовком, ложится в заказ, и письмо с ключами — русское.
        var gameId = await SeedGameAsync(20m);
        await SeedPoolKeyAsync(gameId, $"LG-{Guid.NewGuid():N}"[..20].ToUpperInvariant());
        var client = CreateClient();
        client.DefaultRequestHeaders.Add("Accept-Language", "ru-RU,ru;q=0.9,en;q=0.8");
        var (intentId, _) = await CreateIntentWithCashbackAsync(client, gameId, useCashback: false);
        _factory.Stripe.MarkSucceeded(intentId);
        var anonymous = CreateClient(authenticated: false);
        await AssertSuccessAsync(await SendWebhookAsync(anonymous, PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", intentId)));

        var order = await GetOrderAsync(intentId);
        Assert.Equal("ru", order!.Language);
        var mail = Assert.Single(_factory.Mail.Sent, m => m.To == _userEmail && m.Subject.Contains(order.OrderNumber!));
        Assert.StartsWith("Ваши ключи", mail.Subject);
        Assert.Contains("Ваш ключ готов", mail.HtmlBody);
    }

    // ---------- промокоды, варианты ключей, минорные единицы ----------

    [Fact]
    public async Task Paid_order_records_promo_usage_once_and_per_user_limit_then_applies()
    {
        var code = $"ONCE{Guid.NewGuid():N}"[..14].ToUpperInvariant();
        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<IPromoCodeRepository>().CreateAsync(new PromoCode
            {
                Code = code,
                Type = PromoCodeType.Percentage,
                Value = 10,
                StartDate = DateTime.UtcNow.AddDays(-1),
                EndDate = DateTime.UtcNow.AddDays(1),
                UsagePerUser = 1
            });
        }

        var gameId = await SeedGameAsync(40m);
        var client = CreateClient();
        var created = await client.PostAsJsonAsync("/api/payments/create-payment-intent", new
        {
            items = new[] { new { gameId, quantity = 1 } },
            promoCode = code
        });
        await AssertSuccessAsync(created);
        var body = await created.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("promo").GetProperty("applied").GetBoolean());
        var secret = body.GetProperty("clientSecret").GetString()!;
        var intentId = secret[..secret.IndexOf("_secret", StringComparison.Ordinal)];

        _factory.Stripe.MarkSucceeded(intentId);
        var anonymous = CreateClient(authenticated: false);
        // Два события подряд: и вебхук, и повтор не должны записать использование дважды.
        await AssertSuccessAsync(await SendWebhookAsync(anonymous, PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", intentId)));
        await AssertSuccessAsync(await SendWebhookAsync(anonymous, PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", intentId)));

        var order = await GetOrderAsync(intentId);
        Assert.NotNull(order);
        using (var scope = _factory.Services.CreateScope())
        {
            var usages = scope.ServiceProvider.GetRequiredService<IMongoDatabase>()
                .GetCollection<BsonDocument>("PromoCodeUsages");
            var recorded = await usages.Find(Builders<BsonDocument>.Filter.Eq("Code", code)).ToListAsync();
            Assert.Single(recorded);
            Assert.Equal(order!.Id.ToString(), recorded[0]["OrderId"].AsString);
        }

        // Лимит «один раз на покупателя» теперь срабатывает: второй раз код не применяется
        // ни в проверке на кассе, ни при создании платежа.
        var validation = await client.PostAsJsonAsync("/api/promo/validate", new { code, cartSubtotal = 40m });
        var validationBody = await validation.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(validationBody.GetProperty("valid").GetBoolean());
        // Код причины для перевода на витрине (поле code занято самим промокодом).
        Assert.Equal("promo.userLimit", validationBody.GetProperty("messageCode").GetString());

        var otherGame = await SeedGameAsync(40m);
        var again = await client.PostAsJsonAsync("/api/payments/create-payment-intent", new
        {
            items = new[] { new { gameId = otherGame, quantity = 1 } },
            promoCode = code
        });
        await AssertSuccessAsync(again);
        var againBody = await again.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(againBody.GetProperty("promo").GetProperty("applied").GetBoolean());
    }

    [Fact]
    public async Task Order_keeps_the_regional_key_variant_after_saving()
    {
        var intentId = $"pi_offer_{Guid.NewGuid():N}";
        using (var scope = _factory.Services.CreateScope())
        {
            var orders = scope.ServiceProvider.GetRequiredService<IOrderRepository>();
            var id = Guid.NewGuid();
            await orders.CreateOrderAsync(new Order
            {
                Id = id,
                OrderGuid = id,
                OrderNumber = $"TS-TEST-{Guid.NewGuid():N}"[..20],
                UserId = _userEmail,
                UserName = _userEmail,
                PaymentIntentId = intentId,
                Currency = "USD",
                Items = new List<OrderItemSnapshot>
                {
                    new() { GameId = "g1", Title = "Game", Quantity = 1, OfferKey = "r:EU", OfferTitle = "Europe" }
                }
            });
        }

        var stored = await GetOrderAsync(intentId);
        Assert.Equal("r:EU", stored!.Items.Single().OfferKey);
        Assert.Equal("Europe", stored.Items.Single().OfferTitle);
    }

    [Fact]
    public async Task Refund_amount_respects_currency_minor_units()
    {
        var intentId = $"pi_jpy_{Guid.NewGuid():N}";
        using var scope = _factory.Services.CreateScope();
        var orders = scope.ServiceProvider.GetRequiredService<IOrderRepository>();
        var id = Guid.NewGuid();
        await orders.CreateOrderAsync(new Order
        {
            Id = id,
            OrderGuid = id,
            OrderNumber = $"TS-TEST-{Guid.NewGuid():N}"[..20],
            UserId = _userEmail,
            UserName = _userEmail,
            PaymentIntentId = intentId,
            Currency = "JPY",
            IsPaid = true,
            PaymentStatus = "PAID",
            Status = "DELIVERED"
        });

        var reconciliation = scope.ServiceProvider.GetRequiredService<SuperBot.Infrastructure.Services.IPaymentReconciliationService>();
        // У иены нет копеек: 1500 минорных единиц — это 1500 ¥, а не 15.
        await reconciliation.ApplyRefundAsync(new SuperBot.Infrastructure.Services.RefundNotice
        {
            PaymentIntentId = intentId,
            AmountRefundedMinor = 1500,
            ChargeAmountMinor = 3000,
            Currency = "jpy"
        });

        var refunded = await GetOrderAsync(intentId);
        Assert.Equal("PARTIALLY_REFUNDED", refunded!.PaymentStatus);
        Assert.Equal(1500m, refunded.RefundedAmount);
    }

    // ---------- налог ----------

    /// <summary>Покупатель, выбравший страну на сайте, — по ней считается предварительный налог.</summary>
    private HttpClient CreateClientIn(string country)
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Add("X-Buyer-Country", country);
        return client;
    }

    private async Task PayAsync(string intentId, string? billingCountry)
    {
        _factory.Stripe.MarkSucceeded(intentId, billingCountry);
        await AssertSuccessAsync(await SendWebhookAsync(CreateClient(authenticated: false), PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", intentId)));
    }

    private int CalculationsFor(string gameId) =>
        _factory.StripeTax.Calculations.Count(draft => draft.Lines.Any(line => line.Reference.Contains(gameId)));

    [Fact]
    public async Task Tax_is_inside_the_price_and_is_recorded_after_payment()
    {
        var gameId = await SeedGameAsync(20m);
        var client = CreateClientIn("DE");

        var (intentId, body) = await CreateIntentAsync(client, gameId);

        // 19% внутри $20: 20 − 20 / 1.19 = 3.19. Итог и списание не меняются.
        var totals = body.GetProperty("totals");
        Assert.Equal(3.19m, totals.GetProperty("tax").GetDecimal());
        Assert.True(totals.GetProperty("taxIncluded").GetBoolean());
        Assert.Equal(20m, totals.GetProperty("total").GetDecimal());
        Assert.Equal(19m, body.GetProperty("tax").GetProperty("ratePercent").GetDecimal());
        Assert.Equal(2000, (await _factory.Stripe.GetAsync(intentId))!.Amount);

        await PayAsync(intentId, billingCountry: "DE");

        var order = await GetOrderAsync(intentId);
        Assert.Equal(3.19m, order!.TaxTotal);
        Assert.Equal(20m, order.TotalAmount);
        Assert.Equal(SuperBot.Core.Entities.OrderTaxStatuses.Recorded, order.Tax!.Status);
        Assert.Equal("billing_address", order.Tax.LocationSource);
        Assert.Equal(2000, order.Tax.AmountTotalMinor);
        Assert.True(_factory.StripeTax.Transactions.ContainsKey(intentId));
        // Страна карты совпала с кассой — второго платного расчёта не было.
        Assert.Equal(1, CalculationsFor(gameId));

        var details = await (await client.GetAsync($"/api/account/orders/{order.Id}")).Content.ReadFromJsonAsync<JsonElement>();
        var detailTotals = details.GetProperty("totals");
        Assert.Equal(3.19m, detailTotals.GetProperty("taxTotal").GetDecimal());
        Assert.True(detailTotals.GetProperty("taxIncluded").GetBoolean());
        Assert.Equal(20m, detailTotals.GetProperty("total").GetDecimal());
    }

    [Fact]
    public async Task Final_tax_follows_the_country_of_the_card()
    {
        var gameId = await SeedGameAsync(20m);
        var (intentId, _) = await CreateIntentAsync(CreateClientIn("DE"), gameId);

        await PayAsync(intentId, billingCountry: "FR");

        var order = await GetOrderAsync(intentId);
        Assert.Equal(3.33m, order!.TaxTotal);                    // 20% внутри $20
        Assert.Equal("FR", order.Tax!.Country);
        Assert.Equal(SuperBot.Core.Entities.OrderTaxStatuses.Recorded, order.Tax.Status);
        Assert.Equal(2, CalculationsFor(gameId));
        Assert.Equal(20m, order.TotalAmount);                    // покупатель заплатил столько же
    }

    [Fact]
    public async Task Stripe_Tax_failure_never_blocks_payment_and_the_sync_records_it_later()
    {
        var gameId = await SeedGameAsync(20m);
        _factory.StripeTax.Fail = true;
        string intentId;
        try
        {
            var (id, body) = await CreateIntentAsync(CreateClientIn("DE"), gameId);
            intentId = id;
            Assert.Equal(0m, body.GetProperty("totals").GetProperty("tax").GetDecimal());
            Assert.Equal(JsonValueKind.Null, body.GetProperty("tax").ValueKind);
            Assert.Equal(2000, (await _factory.Stripe.GetAsync(intentId))!.Amount);

            await PayAsync(intentId, billingCountry: "DE");
            var pending = await GetOrderAsync(intentId);
            Assert.NotNull(pending);                              // заказ создан, ключи не задержаны налогом
            Assert.Equal(SuperBot.Core.Entities.OrderTaxStatuses.Pending, pending!.Tax!.Status);
            Assert.False(string.IsNullOrWhiteSpace(pending.Tax.LastError));
        }
        finally
        {
            _factory.StripeTax.Fail = false;
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var order = await GetOrderAsync(intentId);
            await scope.ServiceProvider.GetRequiredService<SuperBot.Infrastructure.Services.IOrderTaxService>().SyncOrderAsync(order!);
        }

        var recorded = await GetOrderAsync(intentId);
        Assert.Equal(SuperBot.Core.Entities.OrderTaxStatuses.Recorded, recorded!.Tax!.Status);
        Assert.Equal(3.19m, recorded.TaxTotal);
        Assert.True(_factory.StripeTax.Transactions.ContainsKey(intentId));
    }

    [Fact]
    public async Task Tax_calculation_is_saved_before_the_transaction_so_a_retry_reuses_it()
    {
        // Транзакция в Stripe Tax необратима: потеряй мы её ответ, повтор со свежим расчётом получил бы отказ навсегда
        // (reference занят). Поэтому расчёт ложится в заказ до транзакции, и повтор идёт с ним же.
        var gameId = await SeedGameAsync(20m);
        string intentId;
        _factory.StripeTax.Fail = true;
        try
        {
            (intentId, _) = await CreateIntentAsync(CreateClientIn("DE"), gameId);
            await PayAsync(intentId, billingCountry: "DE");
        }
        finally
        {
            _factory.StripeTax.Fail = false;
        }

        _factory.StripeTax.FailTransactions = true;
        try
        {
            using var scope = _factory.Services.CreateScope();
            var tax = scope.ServiceProvider.GetRequiredService<SuperBot.Infrastructure.Services.IOrderTaxService>();
            var order = (await GetOrderAsync(intentId))!;
            await Assert.ThrowsAsync<Stripe.StripeException>(() => tax.SyncOrderAsync(order));
        }
        finally
        {
            _factory.StripeTax.FailTransactions = false;
        }

        var pending = await GetOrderAsync(intentId);
        Assert.Equal(SuperBot.Core.Entities.OrderTaxStatuses.Pending, pending!.Tax!.Status);
        Assert.False(string.IsNullOrWhiteSpace(pending.Tax.CalculationId));   // расчёт сохранён, хотя транзакции нет
        Assert.Equal("DE", pending.Tax.Country);
        Assert.Equal(3.19m, pending.TaxTotal);

        var calculationsBefore = _factory.StripeTax.Calculations.Count;
        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<SuperBot.Infrastructure.Services.IOrderTaxService>().SyncOrderAsync((await GetOrderAsync(intentId))!);
        }

        var recorded = await GetOrderAsync(intentId);
        Assert.Equal(SuperBot.Core.Entities.OrderTaxStatuses.Recorded, recorded!.Tax!.Status);
        Assert.Equal(calculationsBefore, _factory.StripeTax.Calculations.Count);        // повтор — с тем же расчётом
        Assert.Equal(pending.Tax.CalculationId, _factory.StripeTax.Transactions[intentId]);
    }

    [Fact]
    public async Task Refunds_reverse_the_tax_transaction_in_the_same_share()
    {
        var gameId = await SeedGameAsync(40m);
        var (intentId, _) = await CreateIntentAsync(CreateClientIn("DE"), gameId);
        await PayAsync(intentId, billingCountry: "DE");
        var anonymous = CreateClient(authenticated: false);

        // Сначала вернули четверть, потом остальное: второй частичный возврат приходит с накопленной суммой.
        await AssertSuccessAsync(await SendWebhookAsync(anonymous, ChargeRefundedPayload($"evt_{Guid.NewGuid():N}", intentId, amount: 4000, refunded: 1000)));
        await AssertSuccessAsync(await SendWebhookAsync(anonymous, ChargeRefundedPayload($"evt_{Guid.NewGuid():N}", intentId, amount: 4000, refunded: 4000)));

        var reversals = _factory.StripeTax.Reversals.Where(item => item.Reference.StartsWith(intentId, StringComparison.Ordinal)).ToList();
        Assert.Equal(2, reversals.Count);
        Assert.False(reversals[0].Full);
        Assert.Equal(1000, reversals[0].AmountMinor);
        Assert.Equal(3000, reversals[1].AmountMinor);
        Assert.Equal($"{intentId}-refund-4000", reversals[1].Reference);

        var order = await GetOrderAsync(intentId);
        Assert.Equal(4000, order!.Tax!.ReversedMinor);
        Assert.Equal("REFUNDED", order.PaymentStatus);

        // Повтор того же события ничего не сторнирует второй раз.
        await AssertSuccessAsync(await SendWebhookAsync(anonymous, ChargeRefundedPayload($"evt_{Guid.NewGuid():N}", intentId, amount: 4000, refunded: 4000)));
        Assert.Equal(2, _factory.StripeTax.Reversals.Count(item => item.Reference.StartsWith(intentId, StringComparison.Ordinal)));
    }

    [Fact]
    public async Task Tax_covers_the_part_paid_with_cashback_and_a_full_refund_reverses_it_whole()
    {
        await GiveCashbackAsync(_userEmail, 10m);
        var gameId = await SeedGameAsync(20m);
        var client = CreateClientIn("DE");

        var response = await client.PostAsJsonAsync("/api/payments/create-payment-intent", new
        {
            items = new[] { new { gameId, quantity = 1 } },
            useCashback = true
        });
        await AssertSuccessAsync(response);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var secret = body.GetProperty("clientSecret").GetString()!;
        var intentId = secret[..secret.IndexOf("_secret", StringComparison.Ordinal)];

        // Кэшбэк — способ оплаты, цена товара та же: налог с $20, хотя картой платится $10.
        Assert.Equal(3.19m, body.GetProperty("totals").GetProperty("tax").GetDecimal());
        Assert.Equal(1000, (await _factory.Stripe.GetAsync(intentId))!.Amount);

        await PayAsync(intentId, billingCountry: "DE");
        Assert.Equal(2000, (await GetOrderAsync(intentId))!.Tax!.AmountTotalMinor);

        await AssertSuccessAsync(await SendWebhookAsync(CreateClient(authenticated: false),
            ChargeRefundedPayload($"evt_{Guid.NewGuid():N}", intentId, amount: 1000, refunded: 1000)));

        var reversal = Assert.Single(_factory.StripeTax.Reversals, item => item.Reference.StartsWith(intentId, StringComparison.Ordinal));
        Assert.True(reversal.Full);
    }

    // ---------- ревью 2026-09-17: повтор корзины, резерв кэшбэка, доля денежного возврата ----------

    private async Task<string?> FinalizationStatusOfAsync(string paymentIntentId)
    {
        using var scope = _factory.Services.CreateScope();
        var doc = await scope.ServiceProvider.GetRequiredService<IMongoDatabase>().GetCollection<BsonDocument>("PaymentFinalizationStates")
            .Find(Builders<BsonDocument>.Filter.Eq("PaymentIntentId", paymentIntentId)).FirstOrDefaultAsync();
        return doc?.GetValue("Status", BsonNull.Value).AsString;
    }

    [Fact]
    public async Task Buying_the_same_cart_again_gets_a_new_intent_and_leaves_the_paid_order_alone()
    {
        // Ключ идемпотентности намерения считался от корзины и суммы: та же игра через минуту возвращала из Stripe
        // УЖЕ ОПЛАЧЕННОЕ намерение, а его состояние переписывалось в Created — повторная оплата шла по старому заказу.
        var gameId = await SeedGameAsync(20m);
        await SeedPoolKeyAsync(gameId, $"RP-{Guid.NewGuid():N}"[..20].ToUpperInvariant());
        var client = CreateClient();

        var (first, _) = await CreateIntentAsync(client, gameId);
        await PayAsync(first, billingCountry: null);
        Assert.True((await GetOrderAsync(first))!.IsPaid);

        var (second, _) = await CreateIntentAsync(client, gameId);
        Assert.NotEqual(first, second);
        Assert.Equal("Succeeded", await FinalizationStatusOfAsync(first));
        Assert.Equal("Created", await FinalizationStatusOfAsync(second));
        Assert.True((await GetOrderAsync(first))!.IsPaid);
        Assert.Equal("requires_payment_method", (await _factory.Stripe.GetAsync(second))!.Status);

        // И напрямую: попытка записать оплаченное намерение как Created игнорируется.
        using var scope = _factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<SuperBot.Infrastructure.Services.IOrderFinalizationService>()
            .RecordIntentCreatedAsync(new SuperBot.Infrastructure.Services.IntentCreatedRecord { PaymentIntentId = first, UserId = _userEmail, Total = 20m, Subtotal = 20m });
        Assert.Equal("Succeeded", await FinalizationStatusOfAsync(first));
    }

    [Fact]
    public async Task Cashback_reserved_for_a_payment_in_flight_is_not_moved_to_the_next_cart()
    {
        // Покупатель подтвердил оплату с кэшбэком, вебхук ещё идёт, а в другой вкладке он собрал новую корзину.
        // Раньше резерв перевешивался на новое намерение, и оплаченный заказ оставался «без кэшбэка» в журнале.
        await GiveCashbackAsync(_userEmail, 10m);
        var paidGame = await SeedGameAsync(20m);
        var nextGame = await SeedGameAsync(30m);
        await SeedPoolKeyAsync(paidGame, $"RS-{Guid.NewGuid():N}"[..20].ToUpperInvariant());
        var client = CreateClient();

        var (paying, _) = await CreateIntentWithCashbackAsync(client, paidGame, useCashback: true);
        _factory.Stripe.MarkSucceeded(paying);                                     // оплата прошла, вебхука ещё нет

        var (next, body) = await CreateIntentWithCashbackAsync(client, nextGame, useCashback: true);
        Assert.NotEqual(paying, next);
        Assert.Equal(0m, body.GetProperty("totals").GetProperty("cashback").GetDecimal());   // весь баланс отложен под оплату
        Assert.Equal(3000, (await _factory.Stripe.GetAsync(next))!.Amount);

        using (var scope = _factory.Services.CreateScope())
        {
            var entries = await scope.ServiceProvider.GetRequiredService<SuperBot.Core.Cashback.ICashbackLedger>().GetEntriesAsync(_userEmail);
            var reservation = Assert.Single(entries, e => e.Type == SuperBot.Core.Cashback.CashbackEntryTypes.Spend);
            Assert.Equal(paying, reservation.Reference);
            Assert.Equal(SuperBot.Core.Cashback.CashbackSpendStatuses.Reserved, reservation.Status);
        }

        await AssertSuccessAsync(await SendWebhookAsync(CreateClient(authenticated: false), PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", paying)));
        var order = await GetOrderAsync(paying);
        Assert.Equal(10m, order!.CashbackApplied);
        var cashback = await CashbackOfAsync(_userEmail);
        Assert.Equal(10m, cashback.UsedAllTimeUsd);
        Assert.Equal(0m, cashback.ReservedUsd);
        Assert.Equal(0m, cashback.AvailableUsd);
    }

    [Fact]
    public async Task Dashboard_refund_on_a_cashback_order_is_measured_against_the_whole_order()
    {
        // $20 заказ: $10 картой, $10 кэшбэком. Возврат $5 из кабинета Stripe — четверть заказа, а не половина карты:
        // покупателю возвращается $2.50 кэшбэка, а не $5.
        await GiveCashbackAsync(_userEmail, 10m);
        var gameId = await SeedGameAsync(20m);
        await SeedPoolKeyAsync(gameId, $"DR-{Guid.NewGuid():N}"[..20].ToUpperInvariant());
        var (intentId, _) = await CreateIntentWithCashbackAsync(CreateClient(), gameId, useCashback: true);
        await PayAsync(intentId, billingCountry: null);
        var anonymous = CreateClient(authenticated: false);

        await AssertSuccessAsync(await SendWebhookAsync(anonymous, ChargeRefundedPayload($"evt_{Guid.NewGuid():N}", intentId, amount: 1000, refunded: 500)));

        var order = await GetOrderAsync(intentId);
        Assert.Equal(5m, order!.RefundedAmount);
        Assert.Equal("PARTIALLY_REFUNDED", order.PaymentStatus);
        Assert.Equal(0.25m, OrderRefunds.Fraction(order));

        var cashback = await CashbackOfAsync(_userEmail);
        Assert.Equal(2.50m, cashback.AvailableUsd);
        Assert.Equal(7.50m, cashback.UsedAllTimeUsd);
    }

    // ---------- сохранённые карты: покупатель Stripe на кассе ----------

    private async Task<string?> StripeCustomerOfAsync(string profileKey)
    {
        using var scope = _factory.Services.CreateScope();
        var profile = await scope.ServiceProvider.GetRequiredService<IBillingProfileRepository>().GetByUserIdAsync(profileKey);
        return profile?.StripeCustomerId;
    }

    [Fact]
    public async Task Signed_in_buyer_pays_from_their_stripe_customer_so_the_card_can_be_saved()
    {
        // Раньше намерение создавалось без покупателя Stripe: карту после оплаты было некуда сохранить, а сохранённые
        // в кабинете карты касса не показывала. Теперь вошедший платит от своего покупателя и получает ключ сессии,
        // с которым форма карты показывает сохранённые карты и галочку «сохранить».
        var gameId = await SeedGameAsync(20m);
        var client = CreateClient();
        var customersBefore = _factory.StripeCustomers.CreateCustomerCount;

        var (intentId, body) = await CreateIntentAsync(client, gameId);

        var customerId = (await _factory.Stripe.GetAsync(intentId))!.CustomerId;
        Assert.False(string.IsNullOrEmpty(customerId));
        // Тот же профиль биллинга, что и у кабинета (ключ — sub): карта с кассы появится в Billing.
        Assert.Equal(customerId, await StripeCustomerOfAsync(_userSub));
        Assert.Equal($"cuss_test_{customerId}_secret", body.GetProperty("customerSessionClientSecret").GetString());
        Assert.Equal(customersBefore + 1, _factory.StripeCustomers.CreateCustomerCount);

        // Следующая корзина того же покупателя — тот же покупатель Stripe, второго не заводим.
        var otherGame = await SeedGameAsync(30m);
        var (nextIntent, _) = await CreateIntentAsync(client, otherGame);
        Assert.Equal(customerId, (await _factory.Stripe.GetAsync(nextIntent))!.CustomerId);
        Assert.Equal(customersBefore + 1, _factory.StripeCustomers.CreateCustomerCount);
    }

    [Fact]
    public async Task Guest_pays_without_a_stripe_customer_or_saved_cards()
    {
        var gameId = await SeedGameAsync(20m);
        var customersBefore = _factory.StripeCustomers.CreateCustomerCount;

        var (intentId, body) = await CreateIntentAsync(CreateClient(authenticated: false), gameId, email: $"guest-{Guid.NewGuid():N}@taleshop.test");

        Assert.Null((await _factory.Stripe.GetAsync(intentId))!.CustomerId);
        Assert.Equal(JsonValueKind.Null, body.GetProperty("customerSessionClientSecret").ValueKind);
        Assert.Equal(customersBefore, _factory.StripeCustomers.CreateCustomerCount);
    }

    [Fact]
    public async Task Checkout_still_works_when_stripe_refuses_a_customer_session()
    {
        var gameId = await SeedGameAsync(20m);
        _factory.StripeCustomers.FailCustomerSessions = true;
        try
        {
            var (intentId, body) = await CreateIntentAsync(CreateClient(), gameId);

            Assert.StartsWith("pi_test_", intentId);
            Assert.False(string.IsNullOrEmpty((await _factory.Stripe.GetAsync(intentId))!.CustomerId));   // покупатель есть
            Assert.Equal(JsonValueKind.Null, body.GetProperty("customerSessionClientSecret").ValueKind);   // сессии нет — форма как у гостя
        }
        finally
        {
            _factory.StripeCustomers.FailCustomerSessions = false;
        }
    }

    // ---------- чем оплачено: в заказе, в кабинете и в письме о возврате ----------

    [Fact]
    public async Task Order_remembers_the_card_it_was_paid_with_and_tells_the_buyer_where_a_refund_goes()
    {
        // Раньше в деталях заказа в поле «способ оплаты» лежал статус платежа, а письмо о возврате обещало деньги
        // «на карту», не говоря какую. Теперь заказ помнит «Visa •••• 4242» из оплаченного намерения Stripe.
        var gameId = await SeedGameAsync(20m);
        await SeedPoolKeyAsync(gameId, $"PW-{Guid.NewGuid():N}"[..20].ToUpperInvariant());
        var client = CreateClient();
        var (intentId, _) = await CreateIntentAsync(client, gameId);
        _factory.Stripe.MarkSucceeded(intentId, brand: "mastercard", last4: "5556", wallet: "apple_pay");
        await AssertSuccessAsync(await SendWebhookAsync(CreateClient(authenticated: false), PaymentSucceededPayload($"evt_{Guid.NewGuid():N}", intentId)));

        var order = await GetOrderAsync(intentId);
        Assert.Equal(("card", "mastercard", "5556", "apple_pay"), (order!.PaidWithType, order.PaidWithBrand, order.PaidWithLast4, order.PaidWithWallet));

        var details = await (await client.GetAsync($"/api/account/orders/{order.Id}")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Apple Pay · Mastercard •••• 5556", details.GetProperty("paymentMethod").GetString());
        var list = await (await client.GetAsync("/api/account/orders")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Contains(list.GetProperty("items").EnumerateArray(), item => item.GetProperty("paymentMethod").GetString() == "Apple Pay · Mastercard •••• 5556");

        _factory.Mail.Clear();
        var admin = _factory.CreateClient();
        admin.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "agent@taleshop.test");
        admin.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        var refund = await admin.PostAsJsonAsync($"/api/admin/orders/{order.Id}/refund", new { reason = "Customer request" });
        Assert.Equal(HttpStatusCode.OK, refund.StatusCode);

        var mail = Assert.Single(_factory.Mail.Sent, m => m.To == _userEmail && m.Subject.Contains("refunded"));
        Assert.Contains("To your Apple Pay · Mastercard •••• 5556: $20.00", mail.TextBody);
    }
}
