using System.Security.Claims;
using System.Text.RegularExpressions;

namespace SuperBot.WebApi.Demo;

/// <summary>
/// Правила демо-сайта. Все посетители — обычные покупатели обычного магазина; особый только общий демо-админ:
/// он видит всё, но ничего не меняет, а почты посетителей видит замаскированными. Правила — по адресам, чтобы весь
/// список был виден в одном месте.
/// </summary>
public static partial class DemoGuard
{
    /// <summary>
    /// Что демо-админ всё-таки может отправить: счётчики, которые витрина шлёт сама (просмотр игры, чтение новости),
    /// чат с ботом поддержки — как любой посетитель, служебное демо и покупку целиком (корзина, регион, промокод, оплата
    /// тестовой картой, свои ключи): клиент, которому показывают портфолио, проходит весь путь под одной учёткой.
    /// Остальные пишущие запросы — отказ: учётка общая, и любая правка (цены, товары, настройки, пароль, профиль, карты)
    /// досталась бы всем следующим посетителям. Повторная отправка ключей письмом закрыта: у демо-админа адрес .invalid.
    /// </summary>
    private static readonly string[] ViewerMayWrite =
    [
        "/api/tracking/",
        "/api/blog/events",
        "/api/support/chat/",
        "/api/demo/",
        "/api/health",
        "/api/users/me/viewed/",
        // Покупка
        "/api/cart/",
        "/api/storefront/region/check",
        "/api/promo/validate",
        "/api/payments/create-payment-intent",
        "/api/payments/confirm-payment-intent",
        "/api/payments/delivery-consent",
    ];

    /// <summary>Пишущие адреса с переменной частью: показ ключей своего заказа (пароль демо-админа публичный).</summary>
    [GeneratedRegex(@"^/api/account/orders/[^/]+/keys/reveal$", RegexOptions.IgnoreCase)]
    private static partial Regex ViewerMayWritePattern();

    public static bool IsWrite(string method) =>
        !(HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method));

    /// <summary>Вошёл общий демо-админ (учётка с ролью admin из Demo:Accounts).</summary>
    public static bool IsViewer(ClaimsPrincipal user, DemoOptions demo)
    {
        if (user.Identity?.IsAuthenticated != true)
        {
            return false;
        }
        var name = user.FindFirstValue("preferred_username");
        return name is not null && demo.Accounts.Any(account =>
            string.Equals(account.Role, "admin", StringComparison.OrdinalIgnoreCase)
            && string.Equals(account.Username, name, StringComparison.OrdinalIgnoreCase));
    }

    public static bool ViewerMaySend(string method, string path) =>
        !IsWrite(method)
        || ViewerMayWrite.Any(prefix => path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        || ViewerMayWritePattern().IsMatch(path);

    /// <summary>
    /// Почты в ответах демо-админу: «j***@gmail.com». Посетители регистрируются своими настоящими адресами, а демо-админ —
    /// общая учётка с публичным паролем. Служебные адреса демо (.invalid, example.*) не трогаем — они не чьи-то.
    /// </summary>
    public static string MaskEmails(string text, IReadOnlyCollection<string>? ownDomains = null) =>
        EmailPattern().Replace(text, match =>
        {
            var local = match.Groups["local"].Value;
            var domain = match.Groups["domain"].Value;
            if (domain.EndsWith(".invalid", StringComparison.OrdinalIgnoreCase)
                || domain.StartsWith("example.", StringComparison.OrdinalIgnoreCase)
                || IsOwnDomain(domain, ownDomains))
            {
                return match.Value;
            }
            return $"{local[0]}***@{domain}";
        });

    [GeneratedRegex(@"(?<local>[A-Za-z0-9._%+\-]+)@(?<domain>[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,})")]
    private static partial Regex EmailPattern();

    private static bool IsOwnDomain(string domain, IReadOnlyCollection<string>? ownDomains) =>
        ownDomains is not null && ownDomains.Any(own =>
            string.Equals(domain, own, StringComparison.OrdinalIgnoreCase)
            || domain.EndsWith("." + own, StringComparison.OrdinalIgnoreCase));

    public const string HiddenInDemo = "Hidden in the demo";

    /// <summary>
    /// Где в ответах бывают IP и устройства посетителей: «Активные сеансы» (у общего демо-админа это сеансы всех, кто под
    /// ним входил), история входов в админке, заявки на восстановление доступа. Маскируем на сервере, а не в интерфейсе:
    /// иначе их было бы видно в ответе через инструменты разработчика.
    /// </summary>
    private static readonly string[] ClientInfoPaths =
    [
        "/api/account/security",
        "/api/admin",
        "/api/account-recovery",
    ];

    public static bool CarriesClientInfo(string path) =>
        ClientInfoPaths.Any(prefix => path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// IP и устройства — демо-админу: поля с ними («ipAddress», «device», «requestUserAgent»…) заменяются пометкой, а адреса
    /// внутри текста (журнал заявки: «from 203.0.113.7») — точками. Время вида 22:50:54 похоже на IPv6 только цифрами
    /// и не трогается: IPv6 узнаём по «::» или шестнадцатеричной букве.
    /// </summary>
    public static string MaskClientInfo(string text)
    {
        text = ClientFieldPattern().Replace(text, match => $"\"{match.Groups["key"].Value}\":\"{HiddenInDemo}\"");
        text = Ipv4Pattern().Replace(text, "•.•.•.•");
        return Ipv6Pattern().Replace(text, "•:•:•");
    }

    [GeneratedRegex("\"(?<key>ipAddress|ip_address|requestIp|requestUserAgent|userAgent|device)\"\\s*:\\s*\"(?:[^\"\\\\]|\\\\.)*\"", RegexOptions.IgnoreCase)]
    private static partial Regex ClientFieldPattern();

    [GeneratedRegex(@"(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?![\d.])")]
    private static partial Regex Ipv4Pattern();

    [GeneratedRegex(@"(?<![\w:])(?=[0-9A-Fa-f:]*(?:::|[A-Fa-f]))(?:[0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4}(?![\w:])")]
    private static partial Regex Ipv6Pattern();
}
