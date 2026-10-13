using System.Net;
using System.Text;
using Microsoft.Extensions.Options;
using SuperBot.WebApi.Newsletter;
using static SuperBot.WebApi.Mail.MailBlocks;

namespace SuperBot.WebApi.Mail;

/// <summary>
/// Письмо-напоминание о брошенной корзине.
///
/// Тон здесь важнее вёрстки. Человек ничего не заказывал и ничего не должен: письмо не
/// требует «завершить покупку», а напоминает, что выбранное сохранилось, и показывает — что
/// именно. Никаких таймеров, «осталось 2 часа» и придуманной срочности: товар цифровой, он
/// не заканчивается, и врать об этом незачем.
///
/// Скидки письмо не обещает. Приучать покупателя бросать корзину ради купона — плохой обмен:
/// маржа падает на всех, включая тех, кто купил бы и так.
///
/// Тексты — из MailTexts на языке покупателя (подписка или последний заказ); неизвестен — английский.
/// Вёрстка — как в остальных письмах: только инлайновые стили, никакого JS и SVG.
/// </summary>
public interface IAbandonedCartMailer
{
    Task SendReminderAsync(
        string email,
        IReadOnlyList<AbandonedCartMailItem> items,
        decimal total,
        string currency,
        string? locale = null,
        CancellationToken cancellationToken = default);
}

/// <summary>Позиция корзины в письме: название, количество и цена за штуку.</summary>
public sealed record AbandonedCartMailItem(string Name, int Quantity, decimal Price);

public class AbandonedCartMailService : IAbandonedCartMailer
{
    // Палитра совпадает с EmailLayout.html и остальными письмами.

    private readonly IMailSender _mail;
    private readonly MailOptions _options;

    public AbandonedCartMailService(IMailSender mail, IOptions<MailOptions> options)
    {
        _mail = mail;
        _options = options.Value;
    }

    private string? BaseUrl =>
        string.IsNullOrWhiteSpace(_options.PublicBaseUrl) ? null : _options.PublicBaseUrl.TrimEnd('/');

    private string? LogoUrl => BaseUrl is null ? null : $"{BaseUrl}/api/email-assets/logo";

    public async Task SendReminderAsync(
        string email,
        IReadOnlyList<AbandonedCartMailItem> items,
        decimal total,
        string currency,
        string? locale = null,
        CancellationToken cancellationToken = default)
    {
        var t = MailTexts.For(locale);
        var subject = items.Count == 1
            ? t.F("cart.subjectOne", items[0].Name)
            : t.F("cart.subjectMany", _options.FromName);

        var cartUrl = BaseUrl is null ? null : $"{BaseUrl}/cart";

        var text = new StringBuilder()
            .AppendLine(t.F("cart.textIntro", _options.FromName))
            .AppendLine();
        foreach (var item in items)
        {
            text.AppendLine($"{item.Name} x {item.Quantity} — {MailMoney.Format(item.Price * item.Quantity, currency)}");
        }
        text.AppendLine()
            .AppendLine(t.F("cart.textTotal", MailMoney.Format(total, currency)))
            .AppendLine();
        if (cartUrl is not null)
        {
            text.AppendLine(t.F("cart.textCart", cartUrl)).AppendLine();
        }
        text.AppendLine(t["cart.textNothing"]);

        var content =
            Hero("\U0001F6D2") + // 🛒
            Heading(t["cart.heading"]) +
            Lead(t.F("cart.lead", Enc(_options.FromName))) +
            ItemsTable(items, total, currency, t) +
            (cartUrl is null ? string.Empty : BrandButton(t["cart.button"], cartUrl)) +
            Footer(t, BaseUrl, Enc(t["cart.footer"]));

        await _mail.SendAsync(email, subject, text.ToString(), EmailTemplates.RenderLayout(content, LogoUrl, t["layout.tagline"]), cancellationToken);
    }

    /// <summary>Что лежит в корзине. Показать содержимое обязательно: без него письмо
    /// превращается в «вернитесь», и получателю нечего вспомнить.</summary>
    private static string ItemsTable(IReadOnlyList<AbandonedCartMailItem> items, decimal total, string currency, MailText t)
    {
        var rows = new StringBuilder();
        foreach (var item in items)
        {
            var quantity = item.Quantity > 1
                ? $"<span style=\"color:{Muted};\"> × {item.Quantity}</span>"
                : string.Empty;
            rows.Append(
                $"<tr><td style=\"padding:8px 0;color:{Ink};font-size:14px;\">{Enc(item.Name)}{quantity}</td>" +
                $"<td style=\"padding:8px 0;text-align:right;color:{Ink};font-size:14px;font-weight:700;white-space:nowrap;\">" +
                $"{Enc(MailMoney.Format(item.Price * item.Quantity, currency))}</td></tr>");
        }

        return
            $"<div style=\"margin:16px 0;padding:14px 18px;background:{SoftBg};border:1px solid {SoftBorder};border-radius:12px;\">" +
            "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse:collapse;\">" +
            rows +
            $"<tr><td style=\"padding:12px 0 0;border-top:1px solid {SoftBorder};color:{Muted};font-size:13px;\">{Enc(t["cart.totalLabel"])}</td>" +
            $"<td style=\"padding:12px 0 0;border-top:1px solid {SoftBorder};text-align:right;color:{Accent};font-size:15px;font-weight:800;white-space:nowrap;\">" +
            $"{Enc(MailMoney.Format(total, currency))}</td></tr>" +
            "</table></div>";
    }
}
