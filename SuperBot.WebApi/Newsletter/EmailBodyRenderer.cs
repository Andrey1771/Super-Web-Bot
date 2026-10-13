using System.Text.RegularExpressions;

namespace SuperBot.WebApi.Newsletter;

/// <summary>Кнопка призыва к действию в письме: в HTML — кнопка, в plain-text — строка "Label: url".</summary>
public sealed record EmailCta(string Label, string Url);

/// <summary>
/// Превращает plain-text тело письма в безопасный HTML (markdown-лайт).
/// Админ пишет обычный текст; поддерживаются **жирный**, [текст](https://ссылка),
/// голые http(s)-ссылки становятся кликабельными, "- " в начале строки → "• ".
/// Сырой HTML не допускается — всё экранируется (это же и защита от XSS в кампаниях).
/// </summary>
public static partial class EmailBodyRenderer
{
    private const string LinkStyle = "color:#6b3ff2;text-decoration:underline;";

    [GeneratedRegex(@"\[(?<label>[^\]\r\n]{1,200})\]\((?<url>https?://[^\s)]+)\)")]
    private static partial Regex MarkdownLink();

    // После HtmlEncode амперсанды в URL уже в виде &amp; — для href это корректная запись.
    [GeneratedRegex(@"https?://[^\s<]+")]
    private static partial Regex BareUrl();

    [GeneratedRegex(@"\*\*(?<t>[^*\r\n]+)\*\*")]
    private static partial Regex Bold();

    public static string ToHtml(string bodyText)
    {
        var escaped = System.Net.WebUtility.HtmlEncode(bodyText.Replace("\r\n", "\n"));

        // Готовые <a>/<strong> прячем в плейсхолдеры, чтобы следующие проходы их не трогали.
        var stash = new List<string>();
        string Stash(string html)
        {
            stash.Add(html);
            return $"\x01{stash.Count - 1}\x01";
        }

        var result = MarkdownLink().Replace(escaped, m =>
            Stash($"<a href=\"{m.Groups["url"].Value}\" style=\"{LinkStyle}\">{m.Groups["label"].Value}</a>"));

        result = BareUrl().Replace(result, m =>
            Stash($"<a href=\"{m.Value}\" style=\"{LinkStyle}\">{m.Value}</a>"));

        result = Bold().Replace(result, m => Stash($"<strong>{m.Groups["t"].Value}</strong>"));

        var lines = result.Split('\n');
        for (var i = 0; i < lines.Length; i++)
        {
            if (lines[i].StartsWith("- ", StringComparison.Ordinal))
            {
                lines[i] = "• " + lines[i][2..];
            }
        }
        result = string.Join("<br/>", lines);

        for (var i = 0; i < stash.Count; i++)
        {
            result = result.Replace($"\x01{i}\x01", stash[i]);
        }
        return result;
    }

    public static string RenderCtaButton(EmailCta cta, string fallbackText)
    {
        var url = System.Net.WebUtility.HtmlEncode(cta.Url);
        var label = System.Net.WebUtility.HtmlEncode(cta.Label);
        var fallback = System.Net.WebUtility.HtmlEncode(fallbackText);
        return
            $"<div style=\"margin:26px 0 8px;text-align:center;\">" +
            $"<a href=\"{url}\" style=\"display:inline-block;background:linear-gradient(90deg,#6b3ff2,#a855f7);color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 32px;border-radius:999px;\">{label}</a>" +
            $"</div>" +
            $"<p style=\"color:#8a7fb4;font-size:12px;text-align:center;margin:0 0 8px;\">{fallback}<br/>" +
            $"<a href=\"{url}\" style=\"color:#6b3ff2;word-break:break-all;\">{url}</a></p>";
    }
}
