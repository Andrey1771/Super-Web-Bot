using System.Net;

namespace SuperBot.WebApi.Mail;

/// <summary>
/// Общие блоки писем магазина: цвета, иконка-герой, заголовок, вводный абзац, кнопка, примечание и подвал
/// со ссылкой на поддержку. Раньше каждый мейлер держал свою копию, и правка стиля в одном письме
/// расходилась с остальными. Подключается через using static.
/// </summary>
internal static class MailBlocks
{
    public const string Ink = "#2b2350";
    public const string Muted = "#675e88";
    public const string Accent = "#6b3ff2";
    public const string SoftBg = "#f6f4ff";
    public const string SoftBorder = "#e9e3ff";
    public const string BrandGradient = "linear-gradient(135deg,#6b3ff2,#a855f7)";

    public static string Enc(string value) => WebUtility.HtmlEncode(value);

    public static string Hero(string glyph) =>
        "<div style=\"text-align:center;padding:2px 0 16px;\">" +
        "<div style=\"display:inline-block;width:56px;height:56px;line-height:56px;text-align:center;border-radius:50%;" +
        $"background:{SoftBg};border:1px solid {SoftBorder};font-size:26px;\">{glyph}</div>" +
        "</div>";

    public static string Heading(string text) =>
        $"<div style=\"text-align:center;font-size:25px;font-weight:800;color:{Ink};margin:2px 0 12px;letter-spacing:-0.2px;\">{Enc(text)}</div>";

    public static string Lead(string html) =>
        $"<p style=\"margin:0 0 14px;text-align:center;color:{Ink};font-size:15px;line-height:1.65;\">{html}</p>";

    public static string Note(string text) =>
        $"<p style=\"margin:0 0 6px;text-align:center;color:{Muted};font-size:13px;line-height:1.6;\">{Enc(text)}</p>";

    /// <param name="primary">Основная — градиент бренда; вторичная — лёгкая заливка, кликабельна, но не спорит с главным.</param>
    /// <param name="topMargin">Отступ сверху: после таблицы сумм кнопке нужно больше воздуха.</param>
    public static string BrandButton(string label, string url, bool primary = true, int topMargin = 8)
    {
        var skin = primary
            ? $"background:{BrandGradient};color:#ffffff;border:0;"
            : $"background:#f1ecfb;color:{Accent};border:1px solid #ddd2fb;";
        return
            $"<div style=\"text-align:center;margin:{topMargin}px 0 20px;\">" +
            $"<a href=\"{Enc(url)}\" style=\"display:inline-block;{skin}" +
            $"text-decoration:none;font-weight:700;font-size:15px;padding:13px 30px;border-radius:999px;\">{Enc(label)}</a>" +
            "</div>";
    }

    /// <summary>
    /// Подвал: строка «нужна помощь — напишите в поддержку» (если известен адрес сайта) и мелкий текст
    /// под ней — причина письма или ссылка отписки, её собирает сам мейлер.
    /// </summary>
    public static string Footer(MailText t, string? baseUrl, string finePrintHtml, string supportPhraseKey = "common.needHelp")
    {
        var support = string.IsNullOrWhiteSpace(baseUrl)
            ? string.Empty
            : $"<div style=\"text-align:center;margin:0 0 8px;font-size:13px;color:{Muted};\">" +
              $"{Enc(t[supportPhraseKey])} <a href=\"{baseUrl}/support\" style=\"color:{Accent};text-decoration:none;\">{Enc(t["common.contactSupport"])}</a></div>";

        return
            $"<div style=\"margin-top:22px;padding-top:16px;border-top:1px solid {SoftBorder};\">" +
            support +
            $"<p style=\"margin:0;text-align:center;color:{Muted};font-size:12px;line-height:1.6;\">{finePrintHtml}</p>" +
            "</div>";
    }

    /// <summary>Мелкий текст подвала со ссылкой «больше не присылать».</summary>
    public static string UnsubscribeFinePrint(string reason, string stopLabel, string unsubscribeUrl) =>
        Enc(reason) + " " +
        $"<a href=\"{Enc(unsubscribeUrl)}\" style=\"color:{Muted};text-decoration:underline;\">{Enc(stopLabel)}</a>";
}
