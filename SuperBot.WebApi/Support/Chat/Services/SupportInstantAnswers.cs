using System.Text.RegularExpressions;

namespace SuperBot.WebApi.Support.Chat.Services;

/// <summary>
/// Готовые ответы на вопросы, которые повторяются чаще всего. Совпало — отвечаем мгновенно
/// и бесплатно, не совпало — отдаём модели. Тексты продублированы на двух языках намеренно:
/// база знаний англоязычная и служит моделью для пересказа, а здесь нужен готовый ответ клиенту.
/// </summary>
public interface ISupportInstantAnswers
{
    /// <param name="maxWords">Длинный вопрос почти всегда со своими деталями — такому шаблон не подходит.</param>
    InstantAnswer? TryAnswer(string question, string? language, int maxWords, int maxChars);
}

/// <param name="Topic">Идентификатор темы: пишется в метаданные, чтобы не повторять тот же текст дважды.</param>
/// <param name="Text">Готовый ответ на языке диалога.</param>
public record InstantAnswer(string Topic, string Text);

public class SupportInstantAnswers : ISupportInstantAnswers
{
    /// <summary>
    /// Тема считается опознанной, когда сработала хотя бы одна альтернатива в КАЖДОЙ группе.
    /// Одиночного слова «ключ» мало — нужен ещё признак того, что именно про него спрашивают.
    /// </summary>
    private sealed record Topic(string Id, string[][] Groups, string TextRu, string TextEn);

    private const string TailRu = "\n\nЕсли вопрос о конкретном заказе — напишите его номер или email, и я подключу специалиста.";
    private const string TailEn = "\n\nIf this is about a specific order, send the order ID or your email and I'll bring in a specialist.";

    private static readonly Topic[] Topics =
    {
        new(
            Id: "key_delivery",
            Groups: new[]
            {
                new[] { "ключ", "код", "key", "code", "заказ", "order" },
                new[] { "где", "не пришёл", "не пришел", "не получ", "не вижу", "когда", "потерял",
                        "where", "not arrive", "not received", "missing", "when", "lost" }
            },
            TextRu:
                "Ключ приходит на почту сразу после оплаты и всегда остаётся в личном кабинете: **Аккаунт → Заказы** — откройте заказ и нажмите «Показать ключ».\n\n" +
                "Если письма нет:\n" +
                "1. проверьте папки «Спам» и «Промоакции»;\n" +
                "2. убедитесь, что смотрите почту, указанную при оплате;\n" +
                "3. если оплата прошла, а заказа в кабинете нет — платёж мог не завершиться, банк вернёт деньги автоматически." + TailRu,
            TextEn:
                "Your key is emailed right after payment and always stays in your account: **Account → Orders** — open the order and click \"Show key\".\n\n" +
                "If the email is missing:\n" +
                "1. check the Spam and Promotions folders;\n" +
                "2. make sure you're looking at the address used at checkout;\n" +
                "3. if the payment went through but no order appears, the payment may not have completed — your bank releases the hold automatically." + TailEn),

        new(
            Id: "activation",
            Groups: new[]
            {
                new[] { "актив", "activat", "redeem", "погас", "ввести", "enter" },
                new[] { "ключ", "код", "key", "code", "steam", "epic", "ea", "ubisoft", "игр", "game" }
            },
            TextRu:
                "Активация занимает пару минут:\n" +
                "1. **Steam**: Игры → «Активировать через Steam», введите ключ ровно как показан;\n" +
                "2. **Epic, EA, Ubisoft**: откройте страницу активации платформы, войдите и введите ключ, затем перезапустите лаунчер.\n\n" +
                "Если платформа пишет про регион — проверьте региональные ограничения на странице товара: ключ активируется только в своём регионе.\n\n" +
                "Ключ приватный: любой, кто его увидит, сможет активировать. Не отправляйте скриншот ключа никому, даже тем, кто представляется поддержкой." + TailRu,
            TextEn:
                "Redeeming takes a couple of minutes:\n" +
                "1. **Steam**: Games → \"Activate a Product on Steam\", enter the key exactly as shown;\n" +
                "2. **Epic, EA, Ubisoft**: open the platform's redeem page, sign in, enter the key, then restart the launcher.\n\n" +
                "If the platform mentions a region, check the regional restrictions on the product page — a key only activates in its own region.\n\n" +
                "A key is private: anyone who sees it can activate it. Never share a screenshot of it, not even with people claiming to be support." + TailEn),

        new(
            Id: "refund",
            Groups: new[]
            {
                new[] { "возврат", "вернуть деньги", "вернуть средства", "refund", "money back", "return the money" }
            },
            TextRu:
                "Коротко про возвраты: **нераскрытый ключ** обычно вернуть можно, **раскрытый или активированный** — как правило нет, потому что мы уже не можем проверить, что его не использовали. У части игр есть дополнительные ограничения издателя.\n\n" +
                "Как оформить: **Аккаунт → Заказы**, откройте заказ, нажмите «Запросить возврат» и коротко опишите причину. Ответ приходит на почту, обычно в течение 24–48 часов. Одобренный возврат уходит тем же способом оплаты, банк зачисляет за 3–10 рабочих дней." + TailRu,
            TextEn:
                "Refunds in short: an **unrevealed key** is usually refundable, a **revealed or activated** one usually is not — we can no longer verify it wasn't used. Some titles carry extra publisher restrictions.\n\n" +
                "To request one: **Account → Orders**, open the order, click \"Request refund\" and give a short reason. We reply by email, usually within 24–48 hours. Approved refunds go back to the original payment method; banks take 3–10 business days." + TailEn),

        new(
            Id: "payment",
            Groups: new[]
            {
                new[] { "оплат", "плат", "карт", "payment", "pay", "card", "checkout" },
                new[] { "не проход", "отклон", "ошибк", "не работает", "не могу", "проблем", "списал",
                        "declined", "failed", "error", "problem", "can't", "cannot", "charged" }
            },
            TextRu:
                "Чаще всего оплата не проходит по одной из причин:\n" +
                "1. банк отклонил зарубежный платёж — помогает подтверждение операции в приложении банка;\n" +
                "2. не совпадают данные карты или адрес;\n" +
                "3. на карте включён лимит на интернет-платежи.\n\n" +
                "Стоит попробовать другой способ оплаты на странице оформления. Если деньги списались, а заказа нет — это удержание, банк снимет его сам в течение нескольких дней." + TailRu,
            TextEn:
                "A declined payment usually comes down to one of these:\n" +
                "1. the bank blocked a foreign payment — confirming it in your banking app usually fixes it;\n" +
                "2. card details or billing address don't match;\n" +
                "3. online payments are limited on the card.\n\n" +
                "Trying another payment method at checkout is the quickest route. If money left your account but no order appeared, that's a hold — the bank releases it within a few days." + TailEn),

        new(
            Id: "account_recovery",
            Groups: new[]
            {
                new[] { "пароль", "password", "2fa", "двухфактор", "аккаунт", "account", "вход", "login" },
                new[] { "восстанов", "сброс", "забыл", "потерял", "не могу войти", "recover", "reset", "forgot", "can't log in", "cannot log in" }
            },
            TextRu:
                "Доступ восстанавливается только по почте — на странице **/account-recovery**. Заявку рассматривает сотрудник, ответ приходит на указанный адрес.\n\n" +
                "Важно: мы никогда не спрашиваем пароль, полный номер карты и коды двухфакторной аутентификации — ни в чате, ни в письмах. Если у вас их запрашивают, это мошенники." + TailRu,
            TextEn:
                "Account access is restored by email only, on the **/account-recovery** page. A specialist reviews the request and replies to the address you provide.\n\n" +
                "One thing worth knowing: we never ask for your password, full card number or two-factor codes — not in chat, not by email. Anyone who does is running a scam." + TailEn)
    };

    // Слово ищем по началу слова: «оплат» покрывает «оплата», «оплатить», «оплаты».
    private static readonly Dictionary<string, Regex> Patterns = BuildPatterns();

    public InstantAnswer? TryAnswer(string question, string? language, int maxWords, int maxChars)
    {
        if (string.IsNullOrWhiteSpace(question) || question.Length > maxChars)
        {
            return null;
        }

        // «Ключ активировал, игра не появилась, и списали дважды» распознаётся как активация,
        // но шаблон про активацию тут будет мимо — такие вопросы уходят модели.
        var words = question.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).Length;
        if (words > maxWords)
        {
            return null;
        }

        foreach (var topic in Topics)
        {
            if (topic.Groups.All(group => group.Any(term => Patterns[term].IsMatch(question))))
            {
                var isRussian = string.Equals(language, "ru", StringComparison.OrdinalIgnoreCase);
                return new InstantAnswer(topic.Id, isRussian ? topic.TextRu : topic.TextEn);
            }
        }

        return null;
    }

    private static Dictionary<string, Regex> BuildPatterns()
    {
        var patterns = new Dictionary<string, Regex>(StringComparer.Ordinal);
        foreach (var term in Topics.SelectMany(topic => topic.Groups).SelectMany(group => group).Distinct())
        {
            patterns[term] = new Regex(
                $@"\b{Regex.Escape(term)}",
                RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);
        }

        return patterns;
    }
}
