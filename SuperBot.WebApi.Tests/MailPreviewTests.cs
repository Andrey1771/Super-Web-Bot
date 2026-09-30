using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.WebApi.Mail;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Все письма покупателю собираются на каждом языке сайта без английских остатков и без сбоев подстановок.
/// С переменной MAIL_PREVIEW_DIR письма ещё и сохраняются в файлы — для вычитки глазами.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class MailPreviewTests
{
    private readonly TaleShopApiFactory _factory;

    public MailPreviewTests(TaleShopApiFactory factory) => _factory = factory;

    private static readonly string[] Locales = { "en", "ru", "uk", "pl" };

    [Fact]
    public async Task Every_customer_email_renders_in_every_language()
    {
        using var scope = _factory.Services.CreateScope();
        var delivery = scope.ServiceProvider.GetRequiredService<IDeliveryMailer>();
        var cashback = scope.ServiceProvider.GetRequiredService<ICashbackNoticeMailer>();
        var cart = scope.ServiceProvider.GetRequiredService<IAbandonedCartMailer>();
        var invites = scope.ServiceProvider.GetRequiredService<IReviewInviteMailer>();
        var previewDir = Environment.GetEnvironmentVariable("MAIL_PREVIEW_DIR");
        var subjectsByLocale = new Dictionary<string, List<string>>();

        foreach (var locale in Locales)
        {
            var email = $"preview-{locale}-{Guid.NewGuid():N}@taleshop.test";
            var keys = new[]
            {
                new DeliveredKeyNotification("Elden Ring", "STEAM-AAAA-BBBB", "Steam"),
                new DeliveredKeyNotification("Nova Security", "NOVA-CCCC-DDDD", "Nova", ProductTypes.Software)
            };
            var receipt = new KeyDeliveryReceipt(new DateTime(2026, 10, 14, 12, 0, 0, DateTimeKind.Utc), 49.99m, "EUR", "Visa •••• 4242");
            var partial = new KeyDeliveryProgress(3, 2, new[] { new KeyDeliveryPendingLine("Hades II", 1) });

            await delivery.SendKeyDeliveryVerificationAsync(email, "TS-1001", "https://shop.example/verify?token=x", locale);
            await delivery.SendGameKeysAsync(email, "TS-1001", keys, receipt, null, locale);
            await delivery.SendGameKeysAsync(email, "TS-1002", keys, receipt, partial, locale);
            await delivery.SendAutoRefundNoticeAsync(email, "TS-1003", locale);
            await delivery.SendRefundNoticeAsync(email, new OrderRefundNotice("TS-1004", false, new[] { new RefundedLine("Elden Ring", 1) }, 30m, 5m, "EUR", true, "Visa •••• 4242"), locale);
            await cashback.SendAvailableAsync(email, new CashbackNoticeMoney(2.4m, "EUR"), new CashbackNoticeMoney(7.1m, "EUR"), new DateTime(2027, 3, 1), "https://shop.example/cashback/unsubscribe?t=x", locale);
            await cashback.SendExpiringAsync(email, new CashbackNoticeMoney(1.5m, "EUR"), new DateTime(2026, 11, 20), new CashbackNoticeMoney(7.1m, "EUR"), "https://shop.example/cashback/unsubscribe?t=x", locale);
            await cart.SendReminderAsync(email, new[] { new AbandonedCartMailItem("Elden Ring", 1, 49.99m), new AbandonedCartMailItem("Hades II", 2, 19.99m) }, 89.97m, "USD", locale);
            await invites.SendInviteAsync(email, new[] { new ReviewInviteGame("Elden Ring", "elden-ring"), new ReviewInviteGame("Hades II", "hades-ii") }, "https://shop.example/reviews/unsubscribe?t=x", locale);

            var sent = _factory.Mail.AllTo(email);
            Assert.Equal(9, sent.Count);
            subjectsByLocale[locale] = sent.Select(mail => mail.Subject).ToList();

            foreach (var mail in sent)
            {
                // Сбой string.Format бросил бы исключение; здесь ловим неподставленные фигурные скобки и мусор.
                Assert.DoesNotContain("{0}", mail.TextBody);
                Assert.DoesNotContain("{0}", mail.HtmlBody);
                Assert.DoesNotContain("{1}", mail.HtmlBody);
                Assert.False(string.IsNullOrWhiteSpace(mail.Subject));
                Assert.Contains("Tale Shop", mail.HtmlBody);
            }

            if (!string.IsNullOrWhiteSpace(previewDir))
            {
                var dir = Path.Combine(previewDir, locale);
                Directory.CreateDirectory(dir);
                var index = 0;
                foreach (var mail in sent)
                {
                    await File.WriteAllTextAsync(Path.Combine(dir, $"{++index:00}.html"), $"<!-- {mail.Subject} -->\n{mail.HtmlBody}");
                    await File.WriteAllTextAsync(Path.Combine(dir, $"{index:00}.txt"), $"{mail.Subject}\n\n{mail.TextBody}");
                }
            }
        }

        // Каждый язык — своя тема письма: совпадение с английской значит, что перевод не подхватился.
        foreach (var locale in Locales.Skip(1))
        {
            for (var i = 0; i < subjectsByLocale["en"].Count; i++)
            {
                Assert.NotEqual(subjectsByLocale["en"][i], subjectsByLocale[locale][i]);
            }
        }
    }
}
