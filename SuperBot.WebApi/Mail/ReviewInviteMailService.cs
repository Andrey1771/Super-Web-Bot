using System.Net;
using System.Text;
using Microsoft.Extensions.Options;
using SuperBot.WebApi.Newsletter;
using static SuperBot.WebApi.Mail.MailBlocks;

namespace SuperBot.WebApi.Mail;

/// <summary>
/// Письмо «расскажите, как вам игра» через неделю после выдачи ключа.
///
/// Тон: просьба, а не требование, и ни слова о том, какой отзыв нам нужен. Никаких скидок и
/// баллов за отзыв — платить за отзывы значит покупать оценки, и площадки, и закон считают
/// это накруткой. Просим мнение, а не хорошее мнение.
///
/// Письмо не притворяется частью заказа: заказ закрыт, ключ выдан, человек нам ничего не
/// должен. Поэтому внизу стоит ссылка «больше не звать» — одноразовой отпиской без входа в
/// аккаунт, чтобы отказаться было проще, чем терпеть.
///
/// Тексты — из MailTexts на языке заказа; неизвестен — английский.
/// Вёрстка — как в остальных письмах: только инлайновые стили, никакого JS и SVG.
/// </summary>
public interface IReviewInviteMailer
{
    Task SendInviteAsync(
        string email,
        IReadOnlyList<ReviewInviteGame> games,
        string unsubscribeUrl,
        string? locale = null,
        CancellationToken cancellationToken = default);
}

/// <summary>Игра из заказа: как называется и куда вести. Slug уже проверен — без него не зовём.</summary>
public sealed record ReviewInviteGame(string Title, string Slug);

public class ReviewInviteMailService : IReviewInviteMailer
{
    // Палитра совпадает с EmailLayout.html и остальными письмами.

    private readonly IMailSender _mail;
    private readonly MailOptions _options;

    public ReviewInviteMailService(IMailSender mail, IOptions<MailOptions> options)
    {
        _mail = mail;
        _options = options.Value;
    }

    private string? BaseUrl =>
        string.IsNullOrWhiteSpace(_options.PublicBaseUrl) ? null : _options.PublicBaseUrl.TrimEnd('/');

    private string? LogoUrl => BaseUrl is null ? null : $"{BaseUrl}/api/email-assets/logo";

    /// <summary>Прямая ссылка на вкладку отзывов — та же, что открывает кнопка в кабинете.</summary>
    private string? ReviewUrl(ReviewInviteGame game) =>
        BaseUrl is null ? null : $"{BaseUrl}/games/{game.Slug}?tab=reviews";

    public async Task SendInviteAsync(
        string email,
        IReadOnlyList<ReviewInviteGame> games,
        string unsubscribeUrl,
        string? locale = null,
        CancellationToken cancellationToken = default)
    {
        if (games.Count == 0)
        {
            return;
        }

        var t = MailTexts.For(locale);
        var subject = games.Count == 1
            ? t.F("invite.subjectOne", games[0].Title)
            : t["invite.subjectMany"];

        var text = new StringBuilder()
            .AppendLine(games.Count == 1
                ? t.F("invite.textOne", games[0].Title, _options.FromName)
                : t.F("invite.textMany", _options.FromName))
            .AppendLine();

        foreach (var game in games)
        {
            var url = ReviewUrl(game);
            text.AppendLine(url is null ? game.Title : $"{game.Title}: {url}");
        }

        text.AppendLine()
            .AppendLine(t["invite.textNote"])
            .AppendLine()
            .AppendLine(t.F("invite.textUnsubscribe", unsubscribeUrl));

        var content =
            Hero("⭐") + // ⭐
            Heading(games.Count == 1 ? t["invite.headingOne"] : t["invite.headingMany"]) +
            Lead(games.Count == 1
                ? t.F("invite.leadOne", Enc(games[0].Title))
                : t["invite.leadMany"]) +
            GamesList(games, t) +
            Note(t["invite.note"]) +
            Footer(t, BaseUrl, UnsubscribeFinePrint(t["invite.footerReason"], t["invite.footerStop"], unsubscribeUrl));

        await _mail.SendAsync(email, subject, text.ToString(), EmailTemplates.RenderLayout(content, LogoUrl, t["layout.tagline"]), cancellationToken);
    }

    /// <summary>Список купленного с кнопкой у каждой строки: человек должен вспомнить, о чём речь.</summary>
    private string GamesList(IReadOnlyList<ReviewInviteGame> games, MailText t)
    {
        var rows = new StringBuilder();
        foreach (var game in games)
        {
            var url = ReviewUrl(game);
            var action = url is null
                ? string.Empty
                : $"<td style=\"padding:8px 0;text-align:right;white-space:nowrap;\">" +
                  $"<a href=\"{Enc(url)}\" style=\"color:{Accent};text-decoration:none;font-size:13px;font-weight:700;\">{Enc(t["invite.rate"])}</a></td>";

            rows.Append(
                $"<tr><td style=\"padding:8px 0;color:{Ink};font-size:14px;\">{Enc(game.Title)}</td>{action}</tr>");
        }

        var single = games.Count == 1 ? ReviewUrl(games[0]) : null;

        return
            $"<div style=\"margin:16px 0;padding:14px 18px;background:{SoftBg};border:1px solid {SoftBorder};border-radius:12px;\">" +
            "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse:collapse;\">" +
            rows +
            "</table></div>" +
            (single is null ? string.Empty : BrandButton(t["invite.button"], single));
    }
}
