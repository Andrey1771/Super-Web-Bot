using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using HtmlAgilityPack;

namespace SuperBot.WebApi.Services.SteamImport;

/// <summary>
/// Разбор HTML, который Steam отдаёт в карточке игры: описание, системные требования, языки.
/// Набор тегов у Steam ограниченный (bbcode, сконвертированный в HTML), поэтому хватает своего
/// обходчика: заголовки, абзацы, списки, жирный/курсив, ссылки и картинки. Анимации-видео
/// из описаний (автозапуск webm) в markdown не перенести — вместо них их постер-картинка:
/// у некоторых игр (Cyberpunk 2077) описание целиком состоит из таких вставок.
/// </summary>
public static partial class SteamHtml
{
    public static string ToMarkdown(string? html)
    {
        if (string.IsNullOrWhiteSpace(html))
        {
            return "";
        }

        var doc = new HtmlDocument();
        doc.LoadHtml(html);
        var sb = new StringBuilder();
        WriteBlock(doc.DocumentNode, sb, listDepth: 0);

        var text = sb.ToString().Replace("\r", "");
        text = TrailingSpaces().Replace(text, "\n");
        text = ManyBlankLines().Replace(text, "\n\n");
        return text.Trim();
    }

    private static void WriteBlock(HtmlNode node, StringBuilder sb, int listDepth)
    {
        foreach (var child in node.ChildNodes)
        {
            switch (child.Name)
            {
                case "h1":
                case "h2":
                case "h3":
                case "h4":
                case "h5":
                {
                    var heading = Inline(child).Trim();
                    if (heading.Length > 0)
                    {
                        // h1 у Steam — разделы внутри описания; на странице игры над ними уже есть свой заголовок.
                        var level = child.Name == "h1" ? 2 : Math.Min(child.Name[1] - '0' + 1, 4);
                        Paragraph(sb).Append(new string('#', level)).Append(' ').Append(heading).Append("\n\n");
                    }
                    break;
                }
                case "p":
                case "div":
                case "blockquote":
                    if (child.SelectSingleNode(".//ul|.//ol|.//p|.//h1|.//h2|.//h3") is not null)
                    {
                        WriteBlock(child, sb, listDepth);
                    }
                    else
                    {
                        AppendParagraph(sb, Inline(child), child.Name == "blockquote" ? "> " : "");
                    }
                    break;
                case "ul":
                case "ol":
                {
                    Paragraph(sb);
                    var index = 1;
                    foreach (var li in child.ChildNodes.Where(n => n.Name == "li"))
                    {
                        var item = Inline(li, skipLists: true).Trim();
                        if (item.Length > 0)
                        {
                            sb.Append(new string(' ', listDepth * 2))
                              .Append(child.Name == "ol" ? $"{index++}. " : "- ")
                              .Append(item)
                              .Append('\n');
                        }
                        foreach (var nested in li.ChildNodes.Where(n => n.Name is "ul" or "ol"))
                        {
                            var wrapper = HtmlNode.CreateNode("<div></div>");
                            wrapper.AppendChild(nested.Clone());
                            WriteBlock(wrapper, sb, listDepth + 1);
                        }
                    }
                    sb.Append('\n');
                    break;
                }
                case "br":
                    sb.Append('\n');
                    break;
                case "hr":
                    Paragraph(sb).Append("---\n\n");
                    break;
                case "table":
                    // Таблиц у Steam почти не бывает; текст ячеек — построчно, чтобы не потерять содержимое.
                    foreach (var row in child.SelectNodes(".//tr") ?? Enumerable.Empty<HtmlNode>())
                    {
                        var cells = row.ChildNodes.Where(n => n.Name is "td" or "th").Select(c => Inline(c).Trim()).Where(c => c.Length > 0);
                        AppendParagraph(sb, string.Join(" — ", cells), "");
                    }
                    break;
                default:
                    // Текст и строчные теги вне абзацев: собираем подряд до следующего блока.
                    var inline = Inline(child);
                    if (inline.Trim().Length > 0)
                    {
                        sb.Append(inline);
                    }
                    break;
            }
        }
    }

    private static StringBuilder Paragraph(StringBuilder sb)
    {
        if (sb.Length > 0 && !sb.ToString().EndsWith("\n\n", StringComparison.Ordinal))
        {
            sb.Append(sb[^1] == '\n' ? "\n" : "\n\n");
        }
        return sb;
    }

    private static void AppendParagraph(StringBuilder sb, string text, string prefix)
    {
        var lines = text.Split('\n').Select(l => l.Trim()).ToList();
        if (lines.All(l => l.Length == 0))
        {
            return;
        }
        Paragraph(sb);
        sb.Append(string.Join("\n", lines.Select(l => prefix + l))).Append("\n\n");
    }

    private static string Inline(HtmlNode node, bool skipLists = false)
    {
        var sb = new StringBuilder();
        foreach (var child in node.ChildNodes)
        {
            switch (child.Name)
            {
                case "#text":
                    sb.Append(CollapseSpaces().Replace(WebUtility.HtmlDecode(child.InnerText), " "));
                    break;
                case "br":
                    sb.Append('\n');
                    break;
                case "strong":
                case "b":
                    Wrap(sb, Inline(child), "**");
                    break;
                case "i":
                case "em":
                    Wrap(sb, Inline(child), "*");
                    break;
                case "a":
                {
                    var label = Inline(child).Trim();
                    var href = UnwrapLinkFilter(child.GetAttributeValue("href", ""));
                    if (label.Length == 0)
                    {
                        break;
                    }
                    sb.Append(IsHttpUrl(href) ? $"[{label}]({href})" : label);
                    break;
                }
                case "img":
                {
                    var src = child.GetAttributeValue("src", "");
                    if (IsHttpUrl(src))
                    {
                        sb.Append("\n\n![](").Append(src).Append(")\n\n");
                    }
                    break;
                }
                case "video":
                {
                    var poster = child.GetAttributeValue("poster", "");
                    if (IsHttpUrl(poster))
                    {
                        sb.Append("\n\n![](").Append(poster).Append(")\n\n");
                    }
                    break;
                }
                case "script":
                case "style":
                    break;
                case "ul":
                case "ol":
                    if (!skipLists)
                    {
                        sb.Append(Inline(child));
                    }
                    break;
                case "li":
                    sb.Append("\n- ").Append(Inline(child).Trim());
                    break;
                default:
                    sb.Append(Inline(child, skipLists));
                    break;
            }
        }
        return sb.ToString();
    }

    private static void Wrap(StringBuilder sb, string inner, string marker)
    {
        var trimmed = inner.Trim();
        if (trimmed.Length == 0)
        {
            return;
        }
        // Пробелы — снаружи маркеров: «** текст**» markdown не распознаёт.
        if (inner.StartsWith(' ')) sb.Append(' ');
        sb.Append(marker).Append(trimmed).Append(marker);
        if (inner.EndsWith(' ')) sb.Append(' ');
    }

    /// <summary>Steam заворачивает внешние ссылки в steamcommunity.com/linkfilter/?u=… — достаём настоящий адрес.</summary>
    internal static string UnwrapLinkFilter(string href)
    {
        if (Uri.TryCreate(href, UriKind.Absolute, out var uri)
            && uri.Host.EndsWith("steamcommunity.com", StringComparison.OrdinalIgnoreCase)
            && uri.AbsolutePath.StartsWith("/linkfilter", StringComparison.OrdinalIgnoreCase))
        {
            var query = System.Web.HttpUtility.ParseQueryString(uri.Query);
            var target = query["u"] ?? query["url"];
            if (!string.IsNullOrEmpty(target))
            {
                return target;
            }
        }
        return href;
    }

    private static bool IsHttpUrl(string value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp);

    /// <summary>
    /// Системные требования Steam: список «<strong>OS:</strong> Windows 10». Возвращает пары
    /// «метка → значение» в исходном порядке; строки без метки (например, «Requires a 64-bit
    /// processor») — с пустой меткой.
    /// </summary>
    public static IReadOnlyList<KeyValuePair<string, string>> ParseRequirements(string? html)
    {
        var result = new List<KeyValuePair<string, string>>();
        if (string.IsNullOrWhiteSpace(html))
        {
            return result;
        }

        var doc = new HtmlDocument();
        doc.LoadHtml(html);
        var items = doc.DocumentNode.SelectNodes("//li");
        if (items is null)
        {
            // Старые карточки — без списка, строками через <br>.
            var plain = WebUtility.HtmlDecode(BrTag().Replace(html, "\n"));
            plain = AnyTag().Replace(plain, "");
            foreach (var line in plain.Split('\n').Select(l => l.Trim()).Where(l => l.Length > 0))
            {
                AddRequirementLine(result, line);
            }
            return result;
        }

        foreach (var li in items)
        {
            var label = li.SelectSingleNode("./strong")?.InnerText;
            var text = CollapseSpaces().Replace(WebUtility.HtmlDecode(li.InnerText), " ").Trim();
            if (text.Length == 0)
            {
                continue;
            }
            if (!string.IsNullOrWhiteSpace(label))
            {
                var cleanLabel = WebUtility.HtmlDecode(label).Trim().TrimEnd(':').Trim();
                var value = text.StartsWith(WebUtility.HtmlDecode(label).Trim(), StringComparison.Ordinal)
                    ? text[WebUtility.HtmlDecode(label).Trim().Length..].Trim()
                    : text;
                result.Add(new(cleanLabel, value));
            }
            else
            {
                AddRequirementLine(result, text);
            }
        }
        return result;
    }

    private static void AddRequirementLine(List<KeyValuePair<string, string>> result, string line)
    {
        if (line.StartsWith("Minimum", StringComparison.OrdinalIgnoreCase) || line.StartsWith("Recommended", StringComparison.OrdinalIgnoreCase))
        {
            if (line.TrimEnd().EndsWith(':')) return;
        }
        var colon = line.IndexOf(':');
        if (colon > 0 && colon < 30)
        {
            result.Add(new(line[..colon].Trim(), line[(colon + 1)..].Trim()));
        }
        else
        {
            result.Add(new("", line));
        }
    }

    /// <summary>
    /// Языки из строки Steam «English<strong>*</strong>, French, …<br><strong>*</strong>languages with
    /// full audio support». Звёздочка — полная озвучка. Названия — английские (запрос с l=english).
    /// </summary>
    public static IReadOnlyList<SteamLanguage> ParseLanguages(string? html)
    {
        if (string.IsNullOrWhiteSpace(html))
        {
            return [];
        }
        // Хвост-пояснение после <br> отбрасываем, звёздочку превращаем в маркер.
        var main = BrTag().Split(html)[0];
        main = StarMarker().Replace(main, "\u0001");
        main = WebUtility.HtmlDecode(AnyTag().Replace(main, ""));

        return main.Split(',')
            .Select(part => part.Trim())
            .Where(part => part.Length > 0)
            .Select(part => new SteamLanguage(part.Replace("\u0001", "").Trim(), part.Contains('\u0001')))
            .Where(l => l.Name.Length > 0)
            .ToList();
    }

    [GeneratedRegex(@"<strong>\s*\*\s*</strong>|\*", RegexOptions.IgnoreCase)]
    private static partial Regex StarMarker();

    [GeneratedRegex(@"<br\s*/?>", RegexOptions.IgnoreCase)]
    private static partial Regex BrTag();

    [GeneratedRegex(@"<[^>]+>")]
    private static partial Regex AnyTag();

    [GeneratedRegex(@"[ \t\f\v ]+")]
    private static partial Regex CollapseSpaces();

    [GeneratedRegex(@"[ \t]+\n")]
    private static partial Regex TrailingSpaces();

    [GeneratedRegex(@"\n{3,}")]
    private static partial Regex ManyBlankLines();
}

public sealed record SteamLanguage(string Name, bool FullAudio);
