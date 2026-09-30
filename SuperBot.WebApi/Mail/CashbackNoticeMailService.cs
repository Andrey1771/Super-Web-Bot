using System.Net;
using System.Text;
using Microsoft.Extensions.Options;
using SuperBot.WebApi.Newsletter;
using static SuperBot.WebApi.Mail.MailBlocks;

namespace SuperBot.WebApi.Mail;

/// <summary>
/// Письма о кэшбэке: «стал доступен» и «скоро сгорит».
///
/// Это сообщения о деньгах самого покупателя, а не реклама: ни скидок, ни «купите ещё» — только сколько,
/// с какого дня и до какого числа. Внизу ссылка «не присылать письма о кэшбэке», без входа в аккаунт.
///
/// Тексты — из MailTexts на языке покупателя (язык последнего заказа); неизвестен — английский.
/// Вёрстка — как в остальных письмах: только инлайновые стили, никакого JS и SVG.
/// </summary>
public interface ICashbackNoticeMailer
{
    Task SendAvailableAsync(string email, CashbackNoticeMoney unlocked, CashbackNoticeMoney available, DateTime? nextExpiry, string unsubscribeUrl, string? locale = null, CancellationToken ct = default);

    Task SendExpiringAsync(string email, CashbackNoticeMoney expiring, DateTime expiresAt, CashbackNoticeMoney available, string unsubscribeUrl, string? locale = null, CancellationToken ct = default);
}

/// <summary>Сумма в валюте, в которой покупатель платил последний раз (или в долларах, если курса нет).</summary>
public sealed record CashbackNoticeMoney(decimal Amount, string Currency)
{
    public string Format() => MailMoney.Format(Amount, Currency);
}

public class CashbackNoticeMailService : ICashbackNoticeMailer
{
    // Палитра совпадает с EmailLayout.html и остальными письмами.
    private const string Warn = "#b45309";

    private readonly IMailSender _mail;
    private readonly MailOptions _options;

    public CashbackNoticeMailService(IMailSender mail, IOptions<MailOptions> options)
    {
        _mail = mail;
        _options = options.Value;
    }

    private string? BaseUrl =>
        string.IsNullOrWhiteSpace(_options.PublicBaseUrl) ? null : _options.PublicBaseUrl.TrimEnd('/');

    private string? LogoUrl => BaseUrl is null ? null : $"{BaseUrl}/api/email-assets/logo";

    public async Task SendAvailableAsync(string email, CashbackNoticeMoney unlocked, CashbackNoticeMoney available, DateTime? nextExpiry, string unsubscribeUrl, string? locale = null, CancellationToken ct = default)
    {
        var t = MailTexts.For(locale);
        var subject = t.F("cbnotice.availableSubject", unlocked.Format());
        var expiryLine = nextExpiry is { } date ? t.F("cbnotice.expiryLine", t.Date(date)) : null;

        var text = new StringBuilder()
            .AppendLine(t.F("cbnotice.availableText", unlocked.Format()))
            .AppendLine(t.F("cbnotice.availableToSpend", available.Format()))
            .AppendLine()
            .AppendLine(t["cbnotice.howToUseText"]);
        if (expiryLine != null)
        {
            text.AppendLine(expiryLine);
        }
        text.AppendLine()
            .AppendLine(BaseUrl is null ? string.Empty : t.F("cbnotice.yourCashback", $"{BaseUrl}/account/rewards"))
            .AppendLine()
            .AppendLine(t.F("cbnotice.unsubscribeText", unsubscribeUrl));

        var content =
            Hero("🎁") +
            Heading(t["cbnotice.availableHeading"]) +
            Lead(t.F("cbnotice.availableLead", Enc(unlocked.Format()))) +
            Amounts((t["cbnotice.nowAvailable"], available.Format(), Accent)) +
            Note(t["cbnotice.howToUseNote"]) +
            (expiryLine is null ? string.Empty : Note(expiryLine)) +
            (BaseUrl is null ? string.Empty : BrandButton(t["cbnotice.button"], $"{BaseUrl}/account/rewards", topMargin: 14)) +
            Footer(t, BaseUrl, UnsubscribeFinePrint(t["cbnotice.footerReason"], t["cbnotice.footerStop"], unsubscribeUrl), "common.questions");

        await _mail.SendAsync(email, subject, text.ToString(), EmailTemplates.RenderLayout(content, LogoUrl, t["layout.tagline"]), ct);
    }

    public async Task SendExpiringAsync(string email, CashbackNoticeMoney expiring, DateTime expiresAt, CashbackNoticeMoney available, string unsubscribeUrl, string? locale = null, CancellationToken ct = default)
    {
        var t = MailTexts.For(locale);
        var date = t.Date(expiresAt);
        var subject = t.F("cbnotice.expiringSubject", expiring.Format(), date);

        var text = new StringBuilder()
            .AppendLine(t.F("cbnotice.expiringText", expiring.Format(), date))
            .AppendLine(t.F("cbnotice.availableNowText", available.Format()))
            .AppendLine()
            .AppendLine(t["cbnotice.oldestFirstText"])
            .AppendLine()
            .AppendLine(BaseUrl is null ? string.Empty : t.F("cbnotice.yourCashback", $"{BaseUrl}/account/rewards"))
            .AppendLine()
            .AppendLine(t.F("cbnotice.unsubscribeText", unsubscribeUrl));

        var content =
            Hero("⏳") +
            Heading(t["cbnotice.expiringHeading"]) +
            Lead(t.F("cbnotice.expiringLead", Enc(expiring.Format()), Enc(date))) +
            Amounts((t.F("cbnotice.expiresOn", date), expiring.Format(), Warn), (t["cbnotice.availableNow"], available.Format(), Accent)) +
            Note(t["cbnotice.oldestFirstNote"]) +
            (BaseUrl is null ? string.Empty : BrandButton(t["cbnotice.button"], $"{BaseUrl}/account/rewards", topMargin: 14)) +
            Footer(t, BaseUrl, UnsubscribeFinePrint(t["cbnotice.footerReason"], t["cbnotice.footerStop"], unsubscribeUrl), "common.questions");

        await _mail.SendAsync(email, subject, text.ToString(), EmailTemplates.RenderLayout(content, LogoUrl, t["layout.tagline"]), ct);
    }

    private static string Amounts(params (string Label, string Value, string Color)[] rows)
    {
        var html = new StringBuilder();
        foreach (var (label, value, color) in rows)
        {
            html.Append($"<tr><td style=\"padding:6px 0;color:{Muted};font-size:14px;\">{Enc(label)}</td>" +
                        $"<td style=\"padding:6px 0;text-align:right;color:{color};font-size:17px;font-weight:800;white-space:nowrap;\">{Enc(value)}</td></tr>");
        }
        return
            $"<div style=\"margin:16px 0;padding:12px 18px;background:{SoftBg};border:1px solid {SoftBorder};border-radius:12px;\">" +
            "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse:collapse;\">" +
            html + "</table></div>";
    }
}
