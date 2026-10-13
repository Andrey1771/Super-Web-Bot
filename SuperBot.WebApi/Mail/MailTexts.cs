using System.Globalization;
using SuperBot.WebApi.Newsletter;

namespace SuperBot.WebApi.Mail;

/// <summary>
/// Тексты одного письма на одном языке: строка по ключу, подстановки в формате string.Format,
/// множественное число и даты по культуре языка. Нет строки на языке — берётся английская.
/// </summary>
public sealed class MailText
{
    private readonly IReadOnlyDictionary<string, string> _strings;
    private readonly IReadOnlyDictionary<string, string> _fallback;

    internal MailText(string locale, IReadOnlyDictionary<string, string> strings, IReadOnlyDictionary<string, string> fallback)
    {
        Locale = locale;
        Culture = locale switch
        {
            "ru" => CultureInfo.GetCultureInfo("ru-RU"),
            "uk" => CultureInfo.GetCultureInfo("uk-UA"),
            "pl" => CultureInfo.GetCultureInfo("pl-PL"),
            _ => CultureInfo.GetCultureInfo("en-US")
        };
        _strings = strings;
        _fallback = fallback;
    }

    public string Locale { get; }
    public CultureInfo Culture { get; }

    public string this[string key] =>
        _strings.TryGetValue(key, out var value) ? value
        : _fallback.TryGetValue(key, out var fallback) ? fallback
        : key;

    /// <summary>Строка с подстановками: F("keys.subject", orderNumber).</summary>
    public string F(string key, params object?[] args) => string.Format(Culture, this[key], args);

    /// <summary>
    /// Строка со счётчиком: ключ дополняется суффиксом _one/_few/_many/_other по правилам языка,
    /// {0} — само число, остальные подстановки идут следом.
    /// </summary>
    public string N(string key, int count, params object?[] args)
    {
        var category = PluralCategory(count);
        var suffixed = key + "_" + category;
        var template = Has(suffixed) ? this[suffixed] : Has(key + "_other") ? this[key + "_other"] : this[key];
        var all = new object?[args.Length + 1];
        all[0] = count;
        Array.Copy(args, 0, all, 1, args.Length);
        return string.Format(Culture, template, all);
    }

    /// <summary>«14 октября 2026», «October 14, 2026» — день без времени, по культуре языка.</summary>
    public string Date(DateTime value) => value.ToString(this["date.long"], Culture);

    private bool Has(string key) => _strings.ContainsKey(key) || _fallback.ContainsKey(key);

    private string PluralCategory(int count)
    {
        var n = Math.Abs(count);
        switch (Locale)
        {
            case "ru":
            case "uk":
            {
                var mod10 = n % 10;
                var mod100 = n % 100;
                if (mod10 == 1 && mod100 != 11) return "one";
                if (mod10 is >= 2 and <= 4 && mod100 is < 12 or > 14) return "few";
                return "many";
            }
            case "pl":
            {
                if (n == 1) return "one";
                var mod10 = n % 10;
                var mod100 = n % 100;
                if (mod10 is >= 2 and <= 4 && mod100 is < 12 or > 14) return "few";
                return "many";
            }
            default:
                return n == 1 ? "one" : "other";
        }
    }
}

/// <summary>
/// Словарь писем магазина на языках сайта (en/ru/uk/pl). Язык письма — язык покупателя на момент
/// заказа (Order.Language) или подписки; неизвестен — английский, как и раньше.
/// Строки лежат в MailTexts.{en,ru,uk,pl}.cs.
/// </summary>
public static partial class MailTexts
{
    public const string DefaultLocale = EmailTemplates.DefaultLocale;

    // Лениво: словари языков лежат в других файлах partial-класса, и порядок инициализации их
    // статических полей относительно этого не гарантирован — прямой инициализатор ловил null.
    private static readonly Lazy<Dictionary<string, IReadOnlyDictionary<string, string>>> ByLocale = new(() => new()
    {
        ["en"] = En,
        ["ru"] = Ru,
        ["uk"] = Uk,
        ["pl"] = Pl
    });

    /// <summary>«ru-RU»/«UK»/null → тексты на ru/uk/en.</summary>
    public static MailText For(string? locale)
    {
        var key = EmailTemplates.Normalize(locale);
        return new MailText(key, ByLocale.Value.TryGetValue(key, out var strings) ? strings : En, En);
    }

    /// <summary>Все языки словаря — для проверки полноты в тестах.</summary>
    public static IReadOnlyDictionary<string, IReadOnlyDictionary<string, string>> All => ByLocale.Value;
}
