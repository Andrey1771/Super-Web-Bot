using System.Text.Json;

namespace SuperBot.WebApi.Services.SiteSettings;

/// <summary>Ссылка на профиль магазина в соцсети: сеть из известного списка и адрес профиля.</summary>
public sealed class SocialLink
{
    /// <summary>Код сети: telegram, discord, x.</summary>
    public string Network { get; set; } = string.Empty;

    public string Url { get; set; } = string.Empty;
}

/// <summary>
/// Иконки соцсетей в подвале сайта. Раньше адреса были вписаны в разметку и выдуманы
/// (t.me/taleshop и т.п.): кто владеет таким именем, магазин не знал, и покупатель мог уйти
/// по ссылке из подвала на чужой канал, приняв его за официальный. Теперь ссылки задаёт владелец
/// в настройках сайта; пока ни одной нет — блока соцсетей в подвале нет.
///
/// Хранится JSON-строкой в общем документе настроек, как команда «О нас».
/// </summary>
public static class SocialLinks
{
    /// <summary>
    /// Сети, для которых у витрины есть иконка, и домены их профилей. Адрес с другим доменом не принимается:
    /// опечатка или вставленная не та ссылка иначе молча попала бы в подвал каждой страницы.
    /// </summary>
    public static readonly IReadOnlyList<(string Network, string Title, string[] Hosts, string Example)> Networks = new[]
    {
        ("telegram", "Telegram", new[] { "t.me", "telegram.me" }, "https://t.me/yourchannel"),
        ("discord", "Discord", new[] { "discord.gg", "discord.com" }, "https://discord.gg/invite-code"),
        ("x", "X", new[] { "x.com", "twitter.com" }, "https://x.com/yourprofile"),
    };

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>Сохранённый список. Битый JSON — не повод ронять подвал: блок соцсетей просто не покажется.</summary>
    public static IReadOnlyList<SocialLink> Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return Array.Empty<SocialLink>();
        }
        try
        {
            return Normalize(JsonSerializer.Deserialize<List<SocialLink>>(json, Json));
        }
        catch (JsonException)
        {
            return Array.Empty<SocialLink>();
        }
    }

    /// <summary>
    /// Первая ошибка во вводе админа или null. Пустой адрес — не ошибка, это «сети нет»; ошибка — адрес,
    /// который нельзя показывать: не https, чужой домен, неизвестная сеть.
    /// </summary>
    public static string? Validate(IEnumerable<SocialLink>? links)
    {
        foreach (var link in links ?? Array.Empty<SocialLink>())
        {
            if (link is null || string.IsNullOrWhiteSpace(link.Url))
            {
                continue;
            }
            var network = Networks.FirstOrDefault(n => string.Equals(n.Network, link.Network?.Trim(), StringComparison.OrdinalIgnoreCase));
            if (network.Network is null)
            {
                return $"Unknown social network “{link.Network}”.";
            }
            if (!IsProfileUrl(link.Url, network.Hosts))
            {
                return $"{network.Title} link must be an https:// address on {string.Join(" or ", network.Hosts)}, for example {network.Example}.";
            }
        }
        return null;
    }

    /// <summary>
    /// Список к показу и хранению: только известные сети с корректным адресом, по одной ссылке на сеть,
    /// в порядке <see cref="Networks"/> — так иконки в подвале не прыгают от порядка ввода.
    /// </summary>
    public static IReadOnlyList<SocialLink> Normalize(IEnumerable<SocialLink>? links)
    {
        var byNetwork = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var link in links ?? Array.Empty<SocialLink>())
        {
            if (link is null || string.IsNullOrWhiteSpace(link.Url))
            {
                continue;
            }
            var network = Networks.FirstOrDefault(n => string.Equals(n.Network, link.Network?.Trim(), StringComparison.OrdinalIgnoreCase));
            if (network.Network is null || byNetwork.ContainsKey(network.Network) || !IsProfileUrl(link.Url, network.Hosts))
            {
                continue;
            }
            byNetwork[network.Network] = link.Url.Trim();
        }
        return Networks
            .Where(n => byNetwork.ContainsKey(n.Network))
            .Select(n => new SocialLink { Network = n.Network, Url = byNetwork[n.Network] })
            .ToList();
    }

    public static string Serialize(IEnumerable<SocialLink>? links) => JsonSerializer.Serialize(Normalize(links), Json);

    private static bool IsProfileUrl(string url, IEnumerable<string> hosts)
    {
        if (!Uri.TryCreate(url.Trim(), UriKind.Absolute, out var parsed) || parsed.Scheme != Uri.UriSchemeHttps)
        {
            return false;
        }
        var host = parsed.Host.StartsWith("www.", StringComparison.OrdinalIgnoreCase) ? parsed.Host[4..] : parsed.Host;
        // Адрес профиля, а не голый домен: «https://t.me/» ни на кого не ведёт.
        return hosts.Contains(host, StringComparer.OrdinalIgnoreCase) && parsed.AbsolutePath.Trim('/').Length > 0;
    }
}
