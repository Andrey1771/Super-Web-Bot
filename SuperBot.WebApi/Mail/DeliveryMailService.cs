using System.Globalization;
using System.Net;
using System.Text;
using Microsoft.Extensions.Options;
using SuperBot.Core.Interfaces;
using SuperBot.WebApi.Newsletter;

namespace SuperBot.WebApi.Mail;

/// <summary>
/// Письма выдачи ключей: подтверждение почты (гостевая покупка), само письмо с ключами
/// и уведомление об авто-возврате. Используют ТУ ЖЕ брендовую обёртку и кнопку, что рассылка
/// (EmailTemplates.RenderLayout + EmailBodyRenderer), но с более «богатой» вёрсткой в духе
/// транзакционных писем крупных сервисов: крупный «герой», ряды-преимущества, подвал поддержки.
///
/// Правила вёрстки писем: только инлайновые стили, никакого JS/SVG (клиенты их вырезают).
/// Полноценный баннер-картинку не используем — для неё нужен хостинг изображений и она блокируется
/// как remote-image; «герой» — крупный emoji в скруглённом блоке, рендерится везде.
/// </summary>
public class DeliveryMailService : IDeliveryMailer
{
    // Палитра совпадает с EmailLayout.html / EmailBodyRenderer.
    private const string Ink = "#2b2350";
    // Приглушённый, но с контрастом близко к WCAG AA на белом (мелкий вторичный текст).
    private const string Muted = "#675e88";
    private const string Accent = "#6b3ff2";
    private const string SoftBg = "#f6f4ff";
    private const string SoftBorder = "#e9e3ff";
    private const string BrandGradient = "linear-gradient(135deg,#6b3ff2,#a855f7)";

    private readonly IMailSender _mail;
    private readonly MailOptions _options;

    public DeliveryMailService(IMailSender mail, IOptions<MailOptions> options)
    {
        _mail = mail;
        _options = options.Value;
    }

    /// <summary>Абсолютный URL логотипа для шапки письма (раздаёт сам бэкенд, см. EmailAssetsController). Пусто → текстовый вордмарк.</summary>
    private string? LogoUrl =>
        string.IsNullOrWhiteSpace(_options.PublicBaseUrl)
            ? null
            : $"{_options.PublicBaseUrl.TrimEnd('/')}/api/email-assets/logo";

    public async Task SendKeyDeliveryVerificationAsync(string email, string orderNumber, string verifyUrl, CancellationToken cancellationToken = default)
    {
        var subject = $"Confirm your email to receive your keys — order {orderNumber}";

        var text =
            $"Thanks for your purchase at {_options.FromName}!\n\n" +
            $"Order {orderNumber} is paid. To receive your game keys, confirm this email address:\n\n" +
            $"{verifyUrl}\n\n" +
            "The link is valid for 48 hours. If you didn't make this purchase, ignore this email.";

        var content =
            Hero("\U0001F4E9") + // ✉️
            Heading("One step left") +
            Lead($"Order {OrderChip(orderNumber)} is paid. Confirm this email address and your keys land in this inbox instantly.") +
            BrandButton("Confirm email & get my keys", verifyUrl) +
            Footer("The link is valid for 48 hours. If you didn't make this purchase, you can safely ignore this email.");

        await _mail.SendAsync(email, subject, text, EmailTemplates.RenderLayout(content, LogoUrl), cancellationToken);
    }

    public async Task SendGameKeysAsync(string email, string orderNumber, IReadOnlyList<DeliveredKeyNotification> keys, KeyDeliveryReceipt? receipt = null, KeyDeliveryProgress? progress = null, CancellationToken cancellationToken = default)
    {
        // Частичная выдача: часть ключей заказа ещё ждёт склада — письмо не должно врать «заказ завершён».
        var partial = progress is { IsComplete: false };

        var subject = partial
            ? $"Part of your order is ready — order {orderNumber}"
            : $"Your game keys — order {orderNumber}";

        var pendingText = partial
            ? "\n\nStill on the way:\n" + string.Join("\n", progress!.Pending.Select(p => $"{p.Title} × {p.Remaining}")) +
              "\nWe'll email these automatically as soon as we restock."
            : string.Empty;

        var text =
            (partial
                ? $"Part of order {orderNumber} is ready ({progress!.DeliveredKeys} of {progress.TotalKeys} keys):\n\n"
                : $"Your keys for order {orderNumber}:\n\n") +
            string.Join("\n", keys.Select(key => $"{key.GameTitle}: {key.Key}")) +
            pendingText +
            "\n\nActivation guide: see the Keys & activation page in your account, or the activation guide on the site.";

        // Карточка ключа — главный элемент письма: акцентная верхняя грань, бейдж площадки и крупный ключ.
        var keyCards = new StringBuilder();
        foreach (var key in keys)
        {
            keyCards.Append(
                $"<div style=\"margin:12px 0;padding:18px 20px;background:{SoftBg};border:1px solid {SoftBorder};border-top:3px solid {Accent};border-radius:12px;text-align:center;\">" +
                "<div style=\"margin-bottom:8px;\">" +
                $"<span style=\"color:{Muted};font-size:12px;text-transform:uppercase;letter-spacing:0.4px;\">{Enc(key.GameTitle)}</span>" +
                PlatformBadge(key.Platform) +
                "</div>" +
                $"<div style=\"font-family:'Courier New',monospace;font-size:21px;font-weight:700;color:{Ink};letter-spacing:0.8px;word-break:break-all;\">{Enc(key.Key)}</div>" +
                "</div>");
        }

        // Заметная фирменная кнопка — понятный следующий шаг (как активировать ключ).
        var activation = string.IsNullOrWhiteSpace(_options.PublicBaseUrl)
            ? string.Empty
            : BrandButton("How to activate your key", $"{_options.PublicBaseUrl.TrimEnd('/')}/support/docs/activation-guide");

        var heading = partial
            ? "Part of your order is ready"
            : (keys.Count > 1 ? "Your keys are ready" : "Your key is ready");

        var lead = partial
            ? Lead($"Order {OrderChip(orderNumber)} — <strong>{progress!.DeliveredKeys} of {progress.TotalKeys} keys</strong> are ready. " +
                   "Here's what's ready now; the rest arrives automatically as soon as we restock.")
            : Lead($"Order {OrderChip(orderNumber)} is complete. <strong>Your game key is below</strong> — redeem it on the store to start playing.");

        // Без герой-кружка: в этом письме герой — сама карточка ключа, а не дублирующая emoji-иконка.
        var content =
            Heading(heading) +
            lead +
            ReceiptLine(receipt) +
            keyCards +
            (partial ? PendingBlock(progress!) : string.Empty) +
            activation +
            Footer("Keep this email safe — treat keys like cash. We can't recover a key once it's been used.");

        await _mail.SendAsync(email, subject, text, EmailTemplates.RenderLayout(content, LogoUrl), cancellationToken);
    }

    /// <summary>Блок «ещё в пути»: перечисляет позиции, по которым ключи заказа пока не выданы.</summary>
    private static string PendingBlock(KeyDeliveryProgress progress)
    {
        if (progress.Pending.Count == 0)
        {
            return string.Empty;
        }

        var lines = new StringBuilder();
        foreach (var p in progress.Pending)
        {
            lines.Append(
                $"<div style=\"display:flex;justify-content:space-between;padding:6px 0;color:{Ink};font-size:14px;\">" +
                $"<span>{Enc(p.Title)}</span><span style=\"color:{Muted};font-weight:700;\">× {p.Remaining}</span></div>");
        }

        return
            $"<div style=\"margin:14px 0;padding:14px 18px;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;\">" +
            $"<div style=\"font-size:13px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px;\">Still on the way</div>" +
            lines +
            $"<p style=\"margin:8px 0 0;color:{Muted};font-size:12px;\">We'll email these automatically as soon as we restock.</p></div>";
    }

    public async Task SendAutoRefundNoticeAsync(string email, string orderNumber, CancellationToken cancellationToken = default)
    {
        var subject = $"Order {orderNumber} was refunded — email not confirmed";

        var text =
            $"We didn't receive a confirmation of this email address within 48 hours, so order {orderNumber} " +
            "was cancelled and fully refunded.\n\n" +
            "The money returns to your card, usually within 5–10 business days.\n\n" +
            "If you still want the game, just place the order again — and confirm the email right away.";

        var content =
            Hero("\U0001F504") + // 🔄
            Heading("Order refunded") +
            Lead($"We didn't get a confirmation of this email within 48 hours, so order {OrderChip(orderNumber)} " +
                 "was cancelled and <strong>fully refunded</strong>. The money returns to your card, usually within 5–10 business days.") +
            (string.IsNullOrWhiteSpace(_options.PublicBaseUrl)
                ? string.Empty
                : BrandButton("Browse the store", _options.PublicBaseUrl.TrimEnd('/'))) +
            Footer("Still want the game? Place the order again and confirm the email right away.");

        await _mail.SendAsync(email, subject, text, EmailTemplates.RenderLayout(content, LogoUrl), cancellationToken);
    }

    private static string Enc(string value) => WebUtility.HtmlEncode(value);

    /// <summary>«Герой»: emoji в мягком брендовом круге по центру (verification/refund — им нужен якорь).</summary>
    private static string Hero(string glyph) =>
        "<div style=\"text-align:center;padding:2px 0 16px;\">" +
        "<div style=\"display:inline-block;width:56px;height:56px;line-height:56px;text-align:center;border-radius:50%;" +
        $"background:{SoftBg};border:1px solid {SoftBorder};font-size:26px;\">{glyph}</div>" +
        "</div>";

    private static string Heading(string text) =>
        $"<div style=\"text-align:center;font-size:25px;font-weight:800;color:{Ink};margin:2px 0 12px;letter-spacing:-0.2px;\">{Enc(text)}</div>";

    /// <summary>Вводный абзац по центру; <strong> внутри допускается (значения экранируются на месте вызова).</summary>
    private static string Lead(string html) =>
        $"<p style=\"margin:0 0 14px;text-align:center;color:{Ink};font-size:15px;line-height:1.65;\">{html}</p>";

    /// <summary>Чек-строка под заголовком (по центру): дата · сумма · способ оплаты. Пусто, если чек не передан.</summary>
    private static string ReceiptLine(KeyDeliveryReceipt? receipt)
    {
        if (receipt == null)
        {
            return string.Empty;
        }

        var parts = new List<string> { receipt.PurchasedAt.ToString("MMM d, yyyy", CultureInfo.InvariantCulture) };
        if (receipt.Amount is > 0)
        {
            parts.Add(FormatMoney(receipt.Amount.Value, receipt.Currency));
        }
        if (!string.IsNullOrWhiteSpace(receipt.PaymentMethod))
        {
            parts.Add(receipt.PaymentMethod);
        }

        return $"<p style=\"margin:0 0 18px;text-align:center;color:{Muted};font-size:13px;\">{Enc(string.Join("  ·  ", parts))}</p>";
    }

    private static string FormatMoney(decimal amount, string? currency)
    {
        var cur = string.IsNullOrWhiteSpace(currency) ? "USD" : currency.ToUpperInvariant();
        var symbol = cur switch { "USD" => "$", "EUR" => "€", "GBP" => "£", _ => null };
        return symbol != null
            ? $"{symbol}{amount.ToString("0.00", CultureInfo.InvariantCulture)}"
            : $"{amount.ToString("0.00", CultureInfo.InvariantCulture)} {cur}";
    }

    /// <summary>Кнопка-пилюля. primary — фирменная заливка (главное действие); иначе «призрак»
    /// (контурная), чтобы вторичное действие не перетягивало фокус. Слева, без «голой» ссылки.</summary>
    private static string BrandButton(string label, string url, bool primary = true)
    {
        var skin = primary
            ? $"background:{BrandGradient};color:#ffffff;border:0;"
            // Вторичная: лёгкая брендовая заливка (не пустой контур) — явно кликабельна, но не спорит с ключом.
            : $"background:#f1ecfb;color:{Accent};border:1px solid #ddd2fb;";
        return
            "<div style=\"text-align:center;margin:8px 0 20px;\">" +
            $"<a href=\"{Enc(url)}\" style=\"display:inline-block;{skin}" +
            $"text-decoration:none;font-weight:700;font-size:15px;padding:13px 30px;border-radius:999px;\">{Enc(label)}</a>" +
            "</div>";
    }

    /// <summary>Подвал: короткая сноска + контакт поддержки (слева). Метод экземпляра — нужен PublicBaseUrl.</summary>
    private string Footer(string note)
    {
        var baseUrl = _options.PublicBaseUrl?.TrimEnd('/');
        var support = string.IsNullOrWhiteSpace(baseUrl)
            ? string.Empty
            : $"<div style=\"text-align:center;margin:0 0 8px;font-size:13px;color:{Muted};\">" +
              $"Need help? <a href=\"{baseUrl}/support\" style=\"color:{Accent};text-decoration:none;\">Contact support</a></div>";

        return
            $"<div style=\"margin-top:22px;padding-top:16px;border-top:1px solid {SoftBorder};\">" +
            support +
            $"<p style=\"margin:0;text-align:center;color:{Muted};font-size:12px;line-height:1.6;\">{Enc(note)}</p>" +
            "</div>";
    }

    private static string OrderChip(string orderNumber) =>
        $"<span style=\"font-family:'Courier New',monospace;font-weight:700;color:{Accent};\">{Enc(orderNumber)}</span>";

    /// <summary>Бейдж площадки ключа (Steam и т.п.) рядом с названием игры. Пусто, если неизвестна.</summary>
    private static string PlatformBadge(string? platform) =>
        string.IsNullOrWhiteSpace(platform)
            ? string.Empty
            : "<span style=\"display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;" +
              $"background:#efe9ff;color:{Accent};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;\">{Enc(platform)}</span>";
}
