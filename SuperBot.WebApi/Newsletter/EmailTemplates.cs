namespace SuperBot.WebApi.Newsletter;

/// <summary>Все локализуемые строки системных писем одной записью — один язык, один экземпляр.</summary>
public sealed record EmailStrings(
    string ConfirmSubject,
    string ConfirmBody,
    string ConfirmCta,
    string ButtonFallback,
    string FooterReason,
    string FooterUnsubscribe,
    string DigestSubject, // формат: {0} = число скидок
    string DigestIntro,
    string DigestOutro,
    string DigestSeeAll);

/// <summary>
/// Тексты системных писем (подтверждение, дайджест, футер) на языках сайта.
/// Язык берётся из Locale подписчика (сохраняется при подписке), fallback — английский.
/// Ручные кампании из админки не переводятся — их текст пишет админ.
/// HTML-обёртка живёт в Templates/EmailLayout.html (embedded resource), не в C#.
/// </summary>
public static class EmailTemplates
{
    public const string DefaultLocale = "en";

    private static readonly Lazy<string> Layout = new(() =>
    {
        const string resource = "SuperBot.WebApi.Newsletter.Templates.EmailLayout.html";
        using var stream = typeof(EmailTemplates).Assembly.GetManifestResourceStream(resource)
            ?? throw new InvalidOperationException($"Embedded email layout '{resource}' not found.");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    });

    // Текстовый вордмарк-фолбэк в шапке карточки (слева): показывается, если логотип-картинку
    // не передали (нет PublicBaseUrl) или почтовый клиент заблокировал изображения.
    // Настоящий SVG в письмо не ставим — почтовые клиенты вырезают <svg>; нужен растр (PNG).
    private const string Wordmark =
        "<span style=\"color:#1a1730;font-size:21px;font-weight:800;letter-spacing:0.3px;\">&#10022;&nbsp;Tale Shop</span>";

    /// <summary>
    /// Оборачивает готовый HTML-контент в брендированный макет письма (звёздный фон + логотип-марка слева сверху).
    /// Логотип небольшой и прижат влево — как бренд-марка, чтобы не спорить с центральной иконкой письма.
    /// <paramref name="logoUrl"/> — абсолютный URL растрового логотипа (PNG). Пусто → текстовый вордмарк-фолбэк.
    /// </summary>
    public static string RenderLayout(string contentHtml, string? logoUrl = null)
    {
        var logo = string.IsNullOrWhiteSpace(logoUrl)
            ? Wordmark
            : $"<img src=\"{logoUrl}\" width=\"116\" alt=\"Tale Shop\" " +
              "style=\"display:block;width:116px;height:auto;border:0;outline:none;text-decoration:none;\" />";
        return Layout.Value.Replace("{{LOGO}}", logo).Replace("{{CONTENT}}", contentHtml);
    }

    /// <summary>"ru-RU"/"UK"/null → "ru"/"uk"/"en": первые два символа, только поддерживаемые языки.</summary>
    public static string Normalize(string? locale)
    {
        if (string.IsNullOrWhiteSpace(locale))
        {
            return DefaultLocale;
        }
        var key = locale.Trim().ToLowerInvariant();
        if (key.Length > 2)
        {
            key = key[..2];
        }
        return ByLocale.ContainsKey(key) ? key : DefaultLocale;
    }

    public static EmailStrings For(string? locale) => ByLocale[Normalize(locale)];

    private static readonly Dictionary<string, EmailStrings> ByLocale = new()
    {
        ["en"] = new EmailStrings(
            ConfirmSubject: "Confirm your Tale Shop subscription",
            ConfirmBody:
                "Hi!\n\n" +
                "You (or someone using this address) asked to receive Tale Shop deal alerts and news.\n" +
                "Please confirm your subscription below.\n\n" +
                "If this wasn't you, simply ignore this email — nothing will be sent.",
            ConfirmCta: "Confirm subscription",
            ButtonFallback: "If the button doesn't work, copy this link:",
            FooterReason: "You receive this because you subscribed at Tale Shop.",
            FooterUnsubscribe: "Unsubscribe",
            DigestSubject: "Tale Shop: fresh deals just landed ({0})",
            DigestIntro: "Fresh deals just went live at Tale Shop:",
            DigestOutro: "Grab them while they last — keys are delivered instantly after checkout.",
            DigestSeeAll: "See all deals:"),

        ["ru"] = new EmailStrings(
            ConfirmSubject: "Подтвердите подписку на Tale Shop",
            ConfirmBody:
                "Здравствуйте!\n\n" +
                "Вы (или кто-то, указав этот адрес) попросили присылать скидки и новости Tale Shop.\n" +
                "Подтвердите подписку ниже.\n\n" +
                "Если это были не вы — просто проигнорируйте это письмо, ничего отправлено не будет.",
            ConfirmCta: "Подтвердить подписку",
            ButtonFallback: "Если кнопка не работает, скопируйте ссылку:",
            FooterReason: "Вы получили это письмо, потому что подписались на Tale Shop.",
            FooterUnsubscribe: "Отписаться",
            DigestSubject: "Tale Shop: свежие скидки ({0})",
            DigestIntro: "В Tale Shop появились новые скидки:",
            DigestOutro: "Успейте забрать, пока действуют — ключи приходят сразу после оплаты.",
            DigestSeeAll: "Все скидки:"),

        ["uk"] = new EmailStrings(
            ConfirmSubject: "Підтвердьте підписку на Tale Shop",
            ConfirmBody:
                "Вітаємо!\n\n" +
                "Ви (або хтось, вказавши цю адресу) попросили надсилати знижки та новини Tale Shop.\n" +
                "Підтвердьте підписку нижче.\n\n" +
                "Якщо це були не ви — просто проігноруйте цей лист, нічого надіслано не буде.",
            ConfirmCta: "Підтвердити підписку",
            ButtonFallback: "Якщо кнопка не працює, скопіюйте посилання:",
            FooterReason: "Ви отримали цей лист, бо підписалися на Tale Shop.",
            FooterUnsubscribe: "Відписатися",
            DigestSubject: "Tale Shop: свіжі знижки ({0})",
            DigestIntro: "У Tale Shop з'явилися нові знижки:",
            DigestOutro: "Встигніть забрати, поки діють — ключі надходять одразу після оплати.",
            DigestSeeAll: "Усі знижки:"),

        ["pl"] = new EmailStrings(
            ConfirmSubject: "Potwierdź subskrypcję Tale Shop",
            ConfirmBody:
                "Cześć!\n\n" +
                "Ty (lub ktoś, kto podał ten adres) poprosiłeś o otrzymywanie promocji i nowości Tale Shop.\n" +
                "Potwierdź subskrypcję poniżej.\n\n" +
                "Jeśli to nie Ty — po prostu zignoruj tę wiadomość, nic nie zostanie wysłane.",
            ConfirmCta: "Potwierdź subskrypcję",
            ButtonFallback: "Jeśli przycisk nie działa, skopiuj ten link:",
            FooterReason: "Otrzymujesz tę wiadomość, ponieważ zapisałeś się w Tale Shop.",
            FooterUnsubscribe: "Wypisz się",
            DigestSubject: "Tale Shop: świeże promocje ({0})",
            DigestIntro: "W Tale Shop pojawiły się nowe promocje:",
            DigestOutro: "Złap je, póki trwają — klucze dostarczamy od razu po zakupie.",
            DigestSeeAll: "Wszystkie promocje:"),
    };
}
