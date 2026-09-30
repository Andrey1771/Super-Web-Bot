using System.Globalization;
using System.Net;
using System.Text;
using Microsoft.Extensions.Options;
using SuperBot.Core.Interfaces;
using SuperBot.WebApi.Newsletter;
using static SuperBot.WebApi.Mail.MailBlocks;

namespace SuperBot.WebApi.Mail;

/// <summary>
/// Письма выдачи ключей: подтверждение почты (гостевая покупка), само письмо с ключами
/// и уведомление об авто-возврате. Используют ТУ ЖЕ брендовую обёртку и кнопку, что рассылка
/// (EmailTemplates.RenderLayout + EmailBodyRenderer), но с более «богатой» вёрсткой в духе
/// транзакционных писем крупных сервисов: крупный «герой», ряды-преимущества, подвал поддержки.
///
/// Тексты — из MailTexts на языке покупателя (locale = Order.Language); неизвестен — английский.
///
/// Правила вёрстки писем: только инлайновые стили, никакого JS/SVG (клиенты их вырезают).
/// Полноценный баннер-картинку не используем — для неё нужен хостинг изображений и она блокируется
/// как remote-image; «герой» — крупный emoji в скруглённом блоке, рендерится везде.
/// </summary>
public class DeliveryMailService : IDeliveryMailer
{
    // Палитра совпадает с EmailLayout.html / EmailBodyRenderer.
    // Приглушённый, но с контрастом близко к WCAG AA на белом (мелкий вторичный текст).

    private readonly IMailSender _mail;
    private readonly MailOptions _options;
    private readonly SuperBot.Core.Cashback.ICashbackLedger _cashback;
    private readonly ILogger<DeliveryMailService> _logger;
    private readonly SuperBot.Core.Interfaces.IRepositories.IGameDetailsRepository _gameDetails;

    public DeliveryMailService(
        IMailSender mail,
        IOptions<MailOptions> options,
        SuperBot.Core.Cashback.ICashbackLedger cashback,
        ILogger<DeliveryMailService> logger,
        SuperBot.Core.Interfaces.IRepositories.IGameDetailsRepository gameDetails)
    {
        _mail = mail;
        _options = options.Value;
        _cashback = cashback;
        _logger = logger;
        _gameDetails = gameDetails;
    }

    /// <summary>Ключ ПО в письме: лицензия вместо площадки и где его активировать.</summary>
    private sealed record SoftwareKeyInfo(string? License, string Place, string? Url);

    /// <summary>
    /// Лицензия и место активации для ключей ПО — из карточек товаров. Сбой чтения письмо не задерживает: ключ
    /// уйдёт без этих строк, а инструкция всё равно есть по ссылке.
    /// </summary>
    private async Task<IReadOnlyDictionary<DeliveredKeyNotification, SoftwareKeyInfo>> ResolveSoftwareKeysAsync(IReadOnlyList<DeliveredKeyNotification> keys, MailText t)
    {
        var result = new Dictionary<DeliveredKeyNotification, SoftwareKeyInfo>(ReferenceEqualityComparer.Instance);
        var software = keys.Where(key => SuperBot.Core.Entities.ProductTypes.IsSoftware(key.ProductType)).ToList();
        if (software.Count == 0)
        {
            return result;
        }

        var detailsByGameId = new Dictionary<string, SuperBot.Core.Entities.GameDetails>(StringComparer.OrdinalIgnoreCase);
        try
        {
            var ids = software.Select(key => key.GameId).Where(id => !string.IsNullOrWhiteSpace(id)).Distinct().Select(id => id!).ToList();
            if (ids.Count > 0)
            {
                foreach (var details in await _gameDetails.GetByGameIdsAsync(ids))
                {
                    if (!string.IsNullOrWhiteSpace(details.GameId))
                    {
                        detailsByGameId[details.GameId] = details;
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Software details for the keys email could not be read.");
        }

        foreach (var key in software)
        {
            detailsByGameId.TryGetValue(key.GameId ?? string.Empty, out var details);
            // Ключ без кода издания — ключ издания по умолчанию, как в кабинете и при выдаче.
            var edition = SuperBot.Core.Entities.GameEditions.Resolve(details?.Editions, key.EditionCode);
            var activation = details?.Activation;
            result[key] = new SoftwareKeyInfo(SuperBot.Core.Entities.SoftwareCatalog.LicenseLabel(edition), ActivationPlace(activation, t), activation?.Url);
        }
        return result;
    }

    /// <summary>Как назвать место активации: своё название, иначе сайт из ссылки, иначе по виду — как на витрине.</summary>
    internal static string ActivationPlace(SuperBot.Core.Entities.SoftwareActivation? activation, MailText? t = null)
    {
        t ??= MailTexts.For(null);
        var label = SuperBot.Core.Entities.Localized.Pick(activation?.LabelI18n, t.Locale, activation?.Label);
        if (!string.IsNullOrWhiteSpace(label))
        {
            return label.Trim();
        }
        if (Uri.TryCreate(activation?.Url, UriKind.Absolute, out var uri))
        {
            return uri.Host.StartsWith("www.", StringComparison.OrdinalIgnoreCase) ? uri.Host[4..] : uri.Host;
        }
        return activation?.Target switch
        {
            SuperBot.Core.Entities.SoftwareActivationTarget.MicrosoftAccount => t["place.microsoft"],
            SuperBot.Core.Entities.SoftwareActivationTarget.InApp => t["place.app"],
            _ => t["place.vendor"]
        };
    }

    /// <summary>Абсолютный URL логотипа для шапки письма (раздаёт сам бэкенд, см. EmailAssetsController). Пусто → текстовый вордмарк.</summary>
    private string? LogoUrl =>
        string.IsNullOrWhiteSpace(_options.PublicBaseUrl)
            ? null
            : $"{_options.PublicBaseUrl.TrimEnd('/')}/api/email-assets/logo";

    private string Render(string content, MailText t) => EmailTemplates.RenderLayout(content, LogoUrl, t["layout.tagline"]);

    public async Task SendKeyDeliveryVerificationAsync(string email, string orderNumber, string verifyUrl, string? locale = null, CancellationToken cancellationToken = default)
    {
        var t = MailTexts.For(locale);
        var subject = t.F("verify.subject", orderNumber);
        var text = t.F("verify.text", _options.FromName, orderNumber, verifyUrl);

        var content =
            Hero("\U0001F4E9") + // ✉️
            Heading(t["verify.heading"]) +
            Lead(t.F("verify.lead", OrderChip(orderNumber))) +
            BrandButton(t["verify.button"], verifyUrl) +
            Footer(t, _options.PublicBaseUrl?.TrimEnd('/'), Enc(t["verify.footer"]));

        await _mail.SendAsync(email, subject, text, Render(content, t), cancellationToken);
    }

    public async Task SendGameKeysAsync(string email, string orderNumber, IReadOnlyList<DeliveredKeyNotification> keys, KeyDeliveryReceipt? receipt = null, KeyDeliveryProgress? progress = null, string? locale = null, CancellationToken cancellationToken = default)
    {
        var t = MailTexts.For(locale);
        // Частичная выдача: часть ключей заказа ещё ждёт склада — письмо не должно врать «заказ завершён».
        var partial = progress is { IsComplete: false };
        var cashback = await FindCashbackAsync(email, orderNumber);
        var softwareKeys = await ResolveSoftwareKeysAsync(keys, t);
        // Что в заказе: только игры, только ПО или вперемешку — от этого подписи и ссылка на инструкцию.
        var allSoftware = keys.Count > 0 && softwareKeys.Count == keys.Count;
        var anySoftware = softwareKeys.Count > 0;

        var subject = partial
            ? t.F("keys.subjectPartial", orderNumber)
            : allSoftware ? t.F("keys.subjectSoftware", orderNumber)
            : anySoftware ? t.F("keys.subject", orderNumber)
            : t.F("keys.subjectGame", orderNumber);

        // «3 из 5 ключей» — со склонением по числу ключей.
        var progressText = partial ? t.N("keys.progress", progress!.TotalKeys, progress.DeliveredKeys) : string.Empty;

        var pendingText = partial
            ? "\n\n" + t["keys.textPendingHeader"] + "\n" + string.Join("\n", progress!.Pending.Select(p => $"{p.Title} × {p.Remaining}")) +
              "\n" + t["keys.pendingNote"]
            : string.Empty;

        var text =
            (partial ? t.F("keys.textPartial", orderNumber, progressText) : t.F("keys.textIntro", orderNumber)) + "\n\n" +
            string.Join("\n", keys.Select(key => softwareKeys.TryGetValue(key, out var info)
                ? t.F("keys.textSoftwareLine",
                    key.GameTitle + (info.License is null ? string.Empty : $" ({info.License})"),
                    key.Key,
                    info.Place + (info.Url is null ? string.Empty : $" ({info.Url})"))
                : $"{key.GameTitle}: {key.Key}")) +
            pendingText +
            CashbackText(cashback, t) +
            "\n\n" + t["keys.textGuide"];

        // Карточка ключа — главный элемент письма: акцентная верхняя грань, бейдж площадки и крупный ключ.
        // У ПО вместо площадки — лицензия, а под ключом — где его активировать: ключ ПО вводят не в Steam.
        var keyCards = new StringBuilder();
        foreach (var key in keys)
        {
            softwareKeys.TryGetValue(key, out var info);
            var place = info is null
                ? string.Empty
                : $"<div style=\"margin-top:8px;color:{Muted};font-size:13px;\">" +
                  t.F("keys.activateOn",
                      info.Url is not null && Uri.TryCreate(info.Url, UriKind.Absolute, out var placeUri) && (placeUri.Scheme == Uri.UriSchemeHttps || placeUri.Scheme == Uri.UriSchemeHttp)
                          ? $"<a href=\"{Enc(info.Url)}\" style=\"color:{Accent};text-decoration:none;font-weight:700;\">{Enc(info.Place)}</a>"
                          : $"<strong style=\"color:{Ink};\">{Enc(info.Place)}</strong>") +
                  "</div>";
            keyCards.Append(
                $"<div style=\"margin:12px 0;padding:18px 20px;background:{SoftBg};border:1px solid {SoftBorder};border-top:3px solid {Accent};border-radius:12px;text-align:center;\">" +
                "<div style=\"margin-bottom:8px;\">" +
                $"<span style=\"color:{Muted};font-size:12px;text-transform:uppercase;letter-spacing:0.4px;\">{Enc(key.GameTitle)}</span>" +
                PlatformBadge(info is null ? key.Platform : info.License) +
                "</div>" +
                $"<div style=\"font-family:'Courier New',monospace;font-size:21px;font-weight:700;color:{Ink};letter-spacing:0.8px;word-break:break-all;\">{Enc(key.Key)}</div>" +
                place +
                "</div>");
        }

        // Заметная фирменная кнопка — понятный следующий шаг (как активировать ключ). В заказе только ПО —
        // своя инструкция; вперемешку — игровая кнопкой и ссылка на ПО под ней.
        var baseUrl = _options.PublicBaseUrl?.TrimEnd('/');
        var activation = string.IsNullOrWhiteSpace(baseUrl)
            ? string.Empty
            : allSoftware
                ? BrandButton(t["keys.buttonSoftware"], $"{baseUrl}/support/docs/software-activation")
                : BrandButton(t["keys.buttonGame"], $"{baseUrl}/support/docs/activation-guide") +
                  (anySoftware
                      ? $"<p style=\"margin:-10px 0 18px;text-align:center;font-size:13px;\"><a href=\"{Enc(baseUrl!)}/support/docs/software-activation\" style=\"color:{Accent};text-decoration:none;font-weight:700;\">{Enc(t["keys.linkSoftware"])}</a></p>"
                      : string.Empty);

        var heading = partial
            ? t["keys.headingPartial"]
            : (keys.Count > 1 ? t["keys.headingMany"] : t["keys.headingOne"]);

        var lead = partial
            ? Lead(t.F("keys.leadPartial", OrderChip(orderNumber), Enc(progressText)))
            : allSoftware
                ? Lead(t.F(keys.Count > 1 ? "keys.leadSoftwareMany" : "keys.leadSoftwareOne", OrderChip(orderNumber)))
                : anySoftware
                    ? Lead(t.F("keys.leadMixed", OrderChip(orderNumber)))
                    : Lead(t.F("keys.leadGame", OrderChip(orderNumber)));

        // Без герой-кружка: в этом письме герой — сама карточка ключа, а не дублирующая emoji-иконка.
        var content =
            Heading(heading) +
            lead +
            ReceiptLine(receipt, t) +
            keyCards +
            (partial ? PendingBlock(progress!, t) : string.Empty) +
            CashbackBlock(cashback, t) +
            activation +
            Footer(t, _options.PublicBaseUrl?.TrimEnd('/'), Enc(t["keys.footer"]));

        await _mail.SendAsync(email, subject, text, Render(content, t), cancellationToken);
    }

    /// <summary>Кэшбэк за заказ для письма: сумма в валюте заказа, процент и день, с которого его можно тратить.</summary>
    private sealed record OrderCashback(decimal Amount, string Currency, decimal Percent, DateTime? UnlocksAt);

    /// <summary>
    /// Начисление за этот заказ из журнала. Оно пишется в момент полной выдачи ключей, то есть до этого письма.
    /// Нет начисления (гость, крипта, программа выключена, выдана только часть) — блока нет. Сбой журнала письмо
    /// с ключами не задерживает: ключи важнее.
    /// </summary>
    private async Task<OrderCashback?> FindCashbackAsync(string email, string orderNumber)
    {
        try
        {
            var entries = await _cashback.GetEntriesAsync(email);
            var earn = entries.FirstOrDefault(entry => entry.Type == SuperBot.Core.Cashback.CashbackEntryTypes.Earn
                                                       && string.Equals(entry.OrderNumber, orderNumber, StringComparison.OrdinalIgnoreCase));
            if (earn == null || earn.AmountUsd <= 0)
            {
                return null;
            }

            // Сумма — в валюте заказа, как в кабинете: процент уровня от оплаченного картой.
            if (earn.OrderTotal is > 0 && earn.Percent is > 0 && !string.IsNullOrWhiteSpace(earn.OrderCurrency))
            {
                var currency = earn.OrderCurrency.ToUpperInvariant();
                var amount = SuperBot.Core.Payments.CurrencyMinorUnits.Round(earn.OrderTotal.Value * earn.Percent.Value / 100m, currency);
                return new OrderCashback(amount, currency, earn.Percent.Value, earn.UnlocksAt);
            }
            return new OrderCashback(earn.AmountUsd, "USD", earn.Percent ?? 0m, earn.UnlocksAt);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Cashback for the keys email of order {OrderNumber} could not be read.", orderNumber);
            return null;
        }
    }

    private static string Percent(decimal value) => value.ToString("0.##", CultureInfo.InvariantCulture);

    private static string CashbackText(OrderCashback? cashback, MailText t) =>
        cashback == null
            ? string.Empty
            : "\n\n" + t.F("keys.cashbackText", MailMoney.Format(cashback.Amount, cashback.Currency), Percent(cashback.Percent)) +
              (cashback.UnlocksAt is { } at && at > DateTime.UtcNow ? t.F("keys.cashbackTextFrom", t.Date(at)) : t["keys.cashbackTextNow"]);

    /// <summary>Строка «+€2.40 cashback» под ключами: спокойно, без призывов, — просто что начислено и когда можно тратить.</summary>
    private string CashbackBlock(OrderCashback? cashback, MailText t)
    {
        if (cashback == null)
        {
            return string.Empty;
        }

        var when = cashback.UnlocksAt is { } at && at > DateTime.UtcNow
            ? t.F("keys.cashbackFrom", t.Date(at))
            : t["keys.cashbackNow"];
        var link = string.IsNullOrWhiteSpace(_options.PublicBaseUrl)
            ? string.Empty
            : $" · <a href=\"{Enc(_options.PublicBaseUrl.TrimEnd('/'))}/account/rewards\" style=\"color:{Accent};text-decoration:none;font-weight:700;\">{Enc(t["keys.cashbackLink"])}</a>";

        return
            $"<div style=\"margin:14px 0;padding:14px 18px;background:{SoftBg};border:1px solid {SoftBorder};border-radius:12px;\">" +
            "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse:collapse;\"><tr>" +
            $"<td style=\"color:{Ink};font-size:14px;line-height:1.5;\"><strong>&#127873; {Enc(t["keys.cashbackEarned"])}</strong>" +
            $"<div style=\"color:{Muted};font-size:12px;\">{Enc(when)}{link}</div></td>" +
            $"<td style=\"text-align:right;white-space:nowrap;color:{Accent};font-size:18px;font-weight:800;\">+{Enc(MailMoney.Format(cashback.Amount, cashback.Currency))}" +
            $"<div style=\"color:{Muted};font-size:12px;font-weight:600;\">{Enc(t.F("keys.cashbackOfOrder", Percent(cashback.Percent)))}</div></td>" +
            "</tr></table></div>";
    }

    /// <summary>Блок «ещё в пути»: перечисляет позиции, по которым ключи заказа пока не выданы.</summary>
    private static string PendingBlock(KeyDeliveryProgress progress, MailText t)
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
            $"<div style=\"font-size:13px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px;\">{Enc(t["keys.pendingTitle"])}</div>" +
            lines +
            $"<p style=\"margin:8px 0 0;color:{Muted};font-size:12px;\">{Enc(t["keys.pendingNote"])}</p></div>";
    }

    public async Task SendAutoRefundNoticeAsync(string email, string orderNumber, string? locale = null, CancellationToken cancellationToken = default)
    {
        var t = MailTexts.For(locale);
        var subject = t.F("autorefund.subject", orderNumber);
        var text = t.F("autorefund.text", orderNumber);

        var content =
            Hero("\U0001F504") + // 🔄
            Heading(t["autorefund.heading"]) +
            Lead(t.F("autorefund.lead", OrderChip(orderNumber))) +
            (string.IsNullOrWhiteSpace(_options.PublicBaseUrl)
                ? string.Empty
                : BrandButton(t["autorefund.button"], _options.PublicBaseUrl.TrimEnd('/'))) +
            Footer(t, _options.PublicBaseUrl?.TrimEnd('/'), Enc(t["autorefund.footer"]));

        await _mail.SendAsync(email, subject, text, Render(content, t), cancellationToken);
    }

    public async Task SendRefundNoticeAsync(string email, OrderRefundNotice notice, string? locale = null, CancellationToken cancellationToken = default)
    {
        var t = MailTexts.For(locale);
        var subject = notice.FullRefund
            ? t.F("refund.subjectFull", notice.OrderNumber)
            : t.F("refund.subjectPart", notice.OrderNumber);

        var items = notice.Items.Where(item => !string.IsNullOrWhiteSpace(item.Title) && item.Quantity > 0).ToList();
        string LineText(RefundedLine item) => item.Quantity > 1 ? $"{item.Quantity} × {item.Title}" : item.Title;
        var card = notice.ToCard > 0 ? MailMoney.Format(notice.ToCard, notice.Currency) : null;
        var cashback = notice.ToCashback > 0 ? MailMoney.Format(notice.ToCashback, notice.Currency) : null;

        var text = new System.Text.StringBuilder()
            .AppendLine(notice.FullRefund
                ? t.F("refund.textFull", notice.OrderNumber)
                : t.F("refund.textPart", notice.OrderNumber))
            .AppendLine();
        if (items.Count > 0)
        {
            text.AppendLine(t["refund.refundedList"]);
            foreach (var item in items)
            {
                text.AppendLine($"- {LineText(item)}");
            }
            text.AppendLine();
        }
        // «To your Visa •••• 4242», когда знаем карту: покупатель не помнит, чем платил полгода назад.
        var cardLabel = !notice.ViaCard
            ? t["refund.backWayPaid"]
            : string.IsNullOrWhiteSpace(notice.PaidWith) || notice.PaidWith == "Card" ? t["refund.toCard"] : t.F("refund.toPaidWith", notice.PaidWith);
        if (card != null)
        {
            text.AppendLine(notice.ViaCard
                ? t.F("refund.textCardArrives", cardLabel, card)
                : t.F("refund.textPlain", cardLabel, card));
        }
        if (cashback != null)
        {
            text.AppendLine(t.F("refund.textCashback", cashback));
        }
        if (card == null && cashback == null)
        {
            text.AppendLine(t["refund.underCent"]);
        }
        text.AppendLine().Append(t["refund.questions"]);

        var rows = new List<(string Label, string Value)>();
        if (card != null)
        {
            rows.Add((cardLabel, card));
        }
        if (cashback != null)
        {
            rows.Add((t["refund.toCashback"], cashback));
        }

        var content =
            Hero("\U0001F504") + // 🔄
            Heading(notice.FullRefund ? t["refund.headingFull"] : t["refund.headingPart"]) +
            Lead(notice.FullRefund
                ? t.F("refund.textFull", OrderChip(notice.OrderNumber))
                : t.F("refund.textPart", OrderChip(notice.OrderNumber))) +
            (items.Count == 0
                ? string.Empty
                : $"<div style=\"margin:14px 0;padding:12px 18px;background:{SoftBg};border:1px solid {SoftBorder};border-radius:12px;\">" +
                  $"<div style=\"color:{Muted};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px;\">{Enc(t["refund.refundedTitle"])}</div>" +
                  string.Concat(items.Select(item => $"<div style=\"color:{Ink};font-size:15px;line-height:1.6;\">{Enc(LineText(item))}</div>")) +
                  "</div>") +
            (rows.Count == 0
                ? Lead(Enc(t["refund.underCent"]))
                : "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse:collapse;margin:6px 0 14px;\">" +
                  string.Concat(rows.Select(row =>
                      $"<tr><td style=\"padding:6px 0;color:{Ink};font-size:15px;\">{Enc(row.Label)}</td>" +
                      $"<td style=\"padding:6px 0;text-align:right;white-space:nowrap;color:{Accent};font-size:17px;font-weight:800;\">{Enc(row.Value)}</td></tr>")) +
                  "</table>") +
            (card != null && notice.ViaCard ? Lead($"<span style=\"color:{Muted};font-size:13px;\">{Enc(t["refund.cardArrives"])}</span>") : string.Empty) +
            (cashback != null && !string.IsNullOrWhiteSpace(_options.PublicBaseUrl)
                ? BrandButton(t["refund.button"], $"{_options.PublicBaseUrl.TrimEnd('/')}/account/rewards", primary: false)
                : string.Empty) +
            Footer(t, _options.PublicBaseUrl?.TrimEnd('/'), Enc(t["refund.questions"]));

        await _mail.SendAsync(email, subject, text.ToString(), Render(content, t), cancellationToken);
    }

    /// <summary>Чек-строка под заголовком (по центру): дата · сумма · способ оплаты. Пусто, если чек не передан.</summary>
    private static string ReceiptLine(KeyDeliveryReceipt? receipt, MailText t)
    {
        if (receipt == null)
        {
            return string.Empty;
        }

        var parts = new List<string> { t.Date(receipt.PurchasedAt) };
        if (receipt.Amount is > 0)
        {
            parts.Add(MailMoney.Format(receipt.Amount.Value, receipt.Currency));
        }
        if (!string.IsNullOrWhiteSpace(receipt.PaymentMethod))
        {
            parts.Add(receipt.PaymentMethod);
        }

        return $"<p style=\"margin:0 0 18px;text-align:center;color:{Muted};font-size:13px;\">{Enc(string.Join("  ·  ", parts))}</p>";
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
