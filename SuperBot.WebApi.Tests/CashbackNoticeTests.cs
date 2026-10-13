using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Driver;
using SuperBot.Infrastructure.Data;
using SuperBot.WebApi.Services.Cashback;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Письма о кэшбэке: «стал доступен» и «скоро сгорит». Журнал заполняется напрямую — ждать 14 дней ожидания
/// и 11 месяцев до сгорания тест не может, а решение, кому писать, зависит только от дат в записях.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class CashbackNoticeTests
{
    private readonly TaleShopApiFactory _factory;
    private readonly string _user = $"notice-{Guid.NewGuid():N}@taleshop.test";

    public CashbackNoticeTests(TaleShopApiFactory factory) => _factory = factory;

    private async Task SeedEarnAsync(decimal usd, DateTime unlocksAt, DateTime expiresAt)
    {
        using var scope = _factory.Services.CreateScope();
        var database = scope.ServiceProvider.GetRequiredService<IMongoDatabase>();
        var orderId = Guid.NewGuid().ToString();
        await database.GetCollection<CashbackEntryDb>("CashbackEntries").InsertOneAsync(new CashbackEntryDb
        {
            UserKey = _user,
            Type = "earn",
            AmountUsd = usd,
            OrderId = orderId,
            OrderNumber = "TS-NOTICE",
            OrderTotalUsd = usd * 20,
            OrderTotal = usd * 20,
            OrderCurrency = "USD",
            Percent = 5,
            CreatedAt = unlocksAt.AddDays(-14),
            UnlocksAt = unlocksAt,
            ExpiresAt = expiresAt,
            IdempotencyKey = $"earn:{orderId}"
        });

        // Снимок в счёте — по нему задача находит, кого проверять.
        await database.GetCollection<CashbackAccountDb>("CashbackAccounts").UpdateOneAsync(
            Builders<CashbackAccountDb>.Filter.Eq(item => item.UserKey, _user),
            Builders<CashbackAccountDb>.Update.Inc(item => item.PendingUsd, usd).Set(item => item.UpdatedAt, DateTime.UtcNow),
            new UpdateOptions { IsUpsert = true });
    }

    private async Task<CashbackNoticeRunResult> RunAsync()
    {
        using var scope = _factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<CashbackNoticeService>().RunAsync();
    }

    [Fact]
    public async Task Buyer_hears_once_when_cashback_unlocks_and_once_before_it_expires()
    {
        var now = DateTime.UtcNow;
        await SeedEarnAsync(5m, unlocksAt: now.AddHours(-2), expiresAt: now.AddMonths(12));
        await SeedEarnAsync(3m, unlocksAt: now.AddDays(-300), expiresAt: now.AddDays(20));

        await RunAsync();

        var mails = _factory.Mail.AllTo(_user);
        Assert.Equal(2, mails.Count);
        var available = Assert.Single(mails, mail => mail.Subject.Contains("ready to use"));
        Assert.StartsWith("$5.00", available.Subject);         // только свежая разблокировка, давнюю не объявляем
        Assert.Contains("Available to spend: $8.00", available.TextBody);
        var expiring = Assert.Single(mails, mail => mail.Subject.Contains("expires on"));
        Assert.StartsWith("$3.00", expiring.Subject);
        Assert.Contains("/cashback/unsubscribe?token=", expiring.TextBody);

        // Завтрашний прогон — ни одного повторного письма.
        await RunAsync();
        Assert.Equal(2, _factory.Mail.AllTo(_user).Count);
    }

    [Fact]
    public async Task Pending_spent_or_far_from_expiry_cashback_sends_nothing()
    {
        var now = DateTime.UtcNow;
        await SeedEarnAsync(4m, unlocksAt: now.AddDays(5), expiresAt: now.AddDays(25));     // ещё ждёт — не «доступен» и не «сгорает»
        await SeedEarnAsync(2m, unlocksAt: now.AddDays(-60), expiresAt: now.AddDays(200));  // давно доступен, до сгорания далеко

        await RunAsync();

        Assert.Empty(_factory.Mail.AllTo(_user));
    }

    [Fact]
    public async Task Link_from_the_email_turns_the_emails_off()
    {
        var now = DateTime.UtcNow;
        await SeedEarnAsync(5m, unlocksAt: now.AddHours(-1), expiresAt: now.AddMonths(12));
        await RunAsync();
        var token = CapturingMailSender.ExtractToken(_factory.Mail.LastTo(_user)!, "/cashback/unsubscribe");

        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/cashback/notices/unsubscribe", new { token });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        // Подделанная ссылка не проходит.
        var forged = await client.PostAsJsonAsync("/api/cashback/notices/unsubscribe", new { token = token[..^4] + "0000" });
        Assert.Equal(HttpStatusCode.BadRequest, forged.StatusCode);

        await SeedEarnAsync(7m, unlocksAt: now.AddMinutes(-5), expiresAt: now.AddDays(10));
        await RunAsync();

        Assert.Single(_factory.Mail.AllTo(_user));
    }

    [Fact]
    public async Task Review_unsubscribe_link_does_not_work_for_cashback_emails()
    {
        using var scope = _factory.Services.CreateScope();
        var reviewToken = scope.ServiceProvider
            .GetRequiredService<SuperBot.WebApi.Services.ReviewInvites.IReviewInviteTokenService>()
            .CreateToken(_user);

        var response = await _factory.CreateClient().PostAsJsonAsync("/api/cashback/notices/unsubscribe", new { token = reviewToken });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
