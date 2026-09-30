using System.Collections.Concurrent;
using System.Text.RegularExpressions;

namespace SuperBot.WebApi.Support.Chat.Services;

/// <summary>
/// Готовые ответы на вопросы, которые повторяются чаще всего. Совпало — отвечаем мгновенно
/// и бесплатно, не совпало — отдаём модели. Тексты продублированы на языках сайта намеренно:
/// база знаний англоязычная и служит моделью для пересказа, а здесь нужен готовый ответ клиенту.
/// Нет текста на языке диалога — тема пропускается, и модель отвечает на языке клиента сама.
/// </summary>
public interface ISupportInstantAnswers
{
    /// <param name="maxWords">Длинный вопрос почти всегда со своими деталями — такому шаблон не подходит.</param>
    Task<InstantAnswer?> TryAnswerAsync(string question, string? language, int maxWords, int maxChars);
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
    /// <param name="ExtraGroups">Слова uk/pl по тем же группам, что <paramref name="Groups"/>: при переносе сливаются, при дозаполнении добавляются отдельно.</param>
    internal sealed record Topic(string Id, string[][] Groups, string[][] ExtraGroups, string TextRu, string TextEn, string TextUk, string TextPl);

    private const string TailRu = "\n\nЕсли вопрос о конкретном заказе — напишите его номер или email, и я подключу специалиста.";
    private const string TailEn = "\n\nIf this is about a specific order, send the order ID or your email and I'll bring in a specialist.";
    private const string TailUk = "\n\nЯкщо питання про конкретне замовлення — напишіть його номер або email, і я підключу спеціаліста.";
    private const string TailPl = "\n\nJeśli chodzi o konkretne zamówienie, podaj jego numer lub adres e-mail, a poproszę o pomoc specjalistę.";

    /// <summary>Исходные данные для первичного переноса в базу. В рантайме не используются.</summary>
    internal static readonly Topic[] SeedTopics =
    {
        new(
            Id: "key_delivery",
            Groups: new[]
            {
                new[] { "ключ", "код", "key", "code", "заказ", "order" },
                new[] { "где", "не пришёл", "не пришел", "не получ", "не вижу", "когда", "потерял", "where", "not arrive", "not received", "missing", "when", "lost" },
            },
            // Слова, добавленные вместе с украинским и польским: у уже заведённых статей дописываются один раз.
            ExtraGroups: new[]
            {
                new[] { "замовлення", "klucz", "kod", "zamówieni" },
                new[] { "де", "не прийш", "не отрим", "не бачу", "коли", "загубив", "gdzie", "nie przysz", "nie dostał", "nie otrzymał", "nie widzę", "kiedy", "zgubił" },
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
                "3. if the payment went through but no order appears, the payment may not have completed — your bank releases the hold automatically." + TailEn,
            TextUk:
                "Ключ надходить на пошту одразу після оплати й завжди залишається в кабінеті: **Акаунт → Замовлення** — відкрийте замовлення та натисніть «Показати ключ».\n\n" +
                "Якщо листа немає:\n" +
                "1. перевірте теки «Спам» і «Промоакції»;\n" +
                "2. переконайтеся, що дивитеся пошту, вказану під час оплати;\n" +
                "3. якщо оплата пройшла, а замовлення в кабінеті немає — платіж міг не завершитися, банк поверне кошти автоматично." + TailUk,
            TextPl:
                "Klucz przychodzi e-mailem zaraz po opłaceniu i zawsze zostaje na koncie: **Konto → Zamówienia** — otwórz zamówienie i kliknij „Pokaż klucz”.\n\n" +
                "Jeśli wiadomości nie ma:\n" +
                "1. sprawdź foldery „Spam” i „Oferty”;\n" +
                "2. upewnij się, że patrzysz na adres podany przy płatności;\n" +
                "3. jeśli płatność przeszła, a zamówienia nie ma na koncie — płatność mogła się nie zakończyć, bank zwolni środki automatycznie." + TailPl),

        new(
            Id: "activation",
            Groups: new[]
            {
                new[] { "актив", "activat", "redeem", "погас", "ввести", "enter" },
                new[] { "ключ", "код", "key", "code", "steam", "epic", "ea", "ubisoft", "игр", "game" },
            },
            // Слова, добавленные вместе с украинским и польским: у уже заведённых статей дописываются один раз.
            ExtraGroups: new[]
            {
                new[] { "aktyw", "zrealizow", "wpisać", "wprowadz" },
                new[] { "гр", "klucz", "kod", "gr" },
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
                "A key is private: anyone who sees it can activate it. Never share a screenshot of it, not even with people claiming to be support." + TailEn,
            TextUk:
                "Активація займає пару хвилин:\n" +
                "1. **Steam**: Ігри → «Активувати продукт у Steam», введіть ключ точно так, як показано;\n" +
                "2. **Epic, EA, Ubisoft**: відкрийте сторінку активації платформи, увійдіть і введіть ключ, потім перезапустіть лаунчер.\n\n" +
                "Якщо платформа пише про регіон — перевірте регіональні обмеження на сторінці товару: ключ активується лише у своєму регіоні.\n\n" +
                "Ключ приватний: будь-хто, хто його побачить, зможе активувати. Не надсилайте скриншот ключа нікому, навіть тим, хто називає себе підтримкою." + TailUk,
            TextPl:
                "Aktywacja zajmuje kilka minut:\n" +
                "1. **Steam**: Gry → „Aktywuj produkt w Steam”, wpisz klucz dokładnie tak, jak jest pokazany;\n" +
                "2. **Epic, EA, Ubisoft**: otwórz stronę aktywacji platformy, zaloguj się, wpisz klucz i uruchom launcher ponownie.\n\n" +
                "Jeśli platforma wspomina o regionie, sprawdź ograniczenia regionalne na stronie produktu — klucz aktywuje się tylko w swoim regionie.\n\n" +
                "Klucz jest prywatny: każdy, kto go zobaczy, może go aktywować. Nie wysyłaj nikomu zrzutu ekranu z kluczem, nawet osobom podającym się za wsparcie." + TailPl),

        new(
            Id: "refund",
            Groups: new[]
            {
                new[] { "возврат", "вернуть деньги", "вернуть средства", "refund", "money back", "return the money" },
            },
            // Слова, добавленные вместе с украинским и польским: у уже заведённых статей дописываются один раз.
            ExtraGroups: new[]
            {
                new[] { "поверн", "zwrot", "zwróc", "oddać pieniądze" },
            },
            TextRu:
                "Коротко про возвраты: **нераскрытый ключ** обычно вернуть можно, **раскрытый или активированный** — как правило нет, потому что мы уже не можем проверить, что его не использовали. У части игр есть дополнительные ограничения издателя.\n\n" +
                "Как оформить: **Аккаунт → Заказы**, откройте заказ, нажмите «Запросить возврат» и коротко опишите причину. Ответ приходит на почту, обычно в течение 24–48 часов. Одобренный возврат уходит тем же способом оплаты, банк зачисляет за 3–10 рабочих дней." + TailRu,
            TextEn:
                "Refunds in short: an **unrevealed key** is usually refundable, a **revealed or activated** one usually is not — we can no longer verify it wasn't used. Some titles carry extra publisher restrictions.\n\n" +
                "To request one: **Account → Orders**, open the order, click \"Request refund\" and give a short reason. We reply by email, usually within 24–48 hours. Approved refunds go back to the original payment method; banks take 3–10 business days." + TailEn,
            TextUk:
                "Коротко про повернення: **нерозкритий ключ** зазвичай можна повернути, **розкритий або активований** — як правило, ні, бо ми вже не можемо перевірити, що його не використали. У частини ігор є додаткові обмеження видавця.\n\n" +
                "Як оформити: **Акаунт → Замовлення**, відкрийте замовлення, натисніть «Запросити повернення» і коротко опишіть причину. Відповідь надходить на пошту, зазвичай протягом 24–48 годин. Схвалене повернення йде тим самим способом оплати, банк зараховує за 3–10 робочих днів." + TailUk,
            TextPl:
                "Zwroty w skrócie: **nieodsłonięty klucz** zwykle można zwrócić, **odsłonięty lub aktywowany** — z reguły nie, bo nie możemy już sprawdzić, czy nie został użyty. Część gier ma dodatkowe ograniczenia wydawcy.\n\n" +
                "Jak złożyć wniosek: **Konto → Zamówienia**, otwórz zamówienie, kliknij „Poproś o zwrot” i krótko opisz powód. Odpowiadamy e-mailem, zwykle w ciągu 24–48 godzin. Zatwierdzony zwrot wraca tą samą metodą płatności; banki księgują go w 3–10 dni roboczych." + TailPl),

        new(
            Id: "payment",
            Groups: new[]
            {
                new[] { "оплат", "плат", "карт", "payment", "pay", "card", "checkout" },
                new[] { "не проход", "отклон", "ошибк", "не работает", "не могу", "проблем", "списал", "declined", "failed", "error", "problem", "can't", "cannot", "charged" },
            },
            // Слова, добавленные вместе с украинским и польским: у уже заведённых статей дописываются один раз.
            ExtraGroups: new[]
            {
                new[] { "płatno", "zapłac", "karta", "kartą" },
                new[] { "відхил", "помилк", "не працює", "не можу", "odrzuc", "nie przesz", "błąd", "nie działa", "nie mogę", "pobra", "obciąż" },
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
                "Trying another payment method at checkout is the quickest route. If money left your account but no order appeared, that's a hold — the bank releases it within a few days." + TailEn,
            TextUk:
                "Найчастіше оплата не проходить з однієї з причин:\n" +
                "1. банк відхилив закордонний платіж — допомагає підтвердження операції в застосунку банку;\n" +
                "2. не збігаються дані картки або адреса;\n" +
                "3. на картці увімкнено ліміт на інтернет-платежі.\n\n" +
                "Варто спробувати інший спосіб оплати на сторінці оформлення. Якщо гроші списалися, а замовлення немає — це утримання, банк зніме його сам протягом кількох днів." + TailUk,
            TextPl:
                "Odrzucona płatność zwykle sprowadza się do jednej z przyczyn:\n" +
                "1. bank zablokował płatność zagraniczną — zazwyczaj pomaga potwierdzenie operacji w aplikacji banku;\n" +
                "2. dane karty lub adres się nie zgadzają;\n" +
                "3. na karcie włączony jest limit płatności internetowych.\n\n" +
                "Najszybciej jest spróbować innej metody płatności przy składaniu zamówienia. Jeśli pieniądze zeszły z konta, a zamówienie się nie pojawiło, to blokada — bank zwolni ją w ciągu kilku dni." + TailPl),

        new(
            Id: "account_recovery",
            Groups: new[]
            {
                new[] { "пароль", "password", "2fa", "двухфактор", "аккаунт", "account", "вход", "login" },
                new[] { "восстанов", "сброс", "забыл", "потерял", "не могу войти", "recover", "reset", "forgot", "can't log in", "cannot log in" },
            },
            // Слова, добавленные вместе с украинским и польским: у уже заведённых статей дописываются один раз.
            ExtraGroups: new[]
            {
                new[] { "двофактор", "акаунт", "вхід", "hasł", "dwuetap", "konto", "logowani" },
                new[] { "віднов", "скинути", "забув", "загубив", "не можу увійти", "odzysk", "zresetow", "zapomnia", "nie mogę się zalogować" },
            },
            TextRu:
                "Доступ восстанавливается только по почте — на странице **/account-recovery**. Заявку рассматривает сотрудник, ответ приходит на указанный адрес.\n\n" +
                "Важно: мы никогда не спрашиваем пароль, полный номер карты и коды двухфакторной аутентификации — ни в чате, ни в письмах. Если у вас их запрашивают, это мошенники." + TailRu,
            TextEn:
                "Account access is restored by email only, on the **/account-recovery** page. A specialist reviews the request and replies to the address you provide.\n\n" +
                "One thing worth knowing: we never ask for your password, full card number or two-factor codes — not in chat, not by email. Anyone who does is running a scam." + TailEn,
            TextUk:
                "Доступ відновлюється лише поштою — на сторінці **/account-recovery**. Заявку розглядає співробітник, відповідь надходить на вказану адресу.\n\n" +
                "Важливо: ми ніколи не питаємо пароль, повний номер картки та коди двофакторної автентифікації — ні в чаті, ні в листах. Якщо у вас їх запитують, це шахраї." + TailUk,
            TextPl:
                "Dostęp przywracamy wyłącznie e-mailem — na stronie **/account-recovery**. Wniosek rozpatruje pracownik, a odpowiedź przychodzi na podany adres.\n\n" +
                "Ważne: nigdy nie prosimy o hasło, pełny numer karty ani kody uwierzytelniania dwuetapowego — ani na czacie, ani w e-mailach. Jeśli ktoś o nie pyta, to oszust." + TailPl)
    };

    // Слово ищем по началу слова: «оплат» покрывает «оплата», «оплатить», «оплаты».
    // Список слов приходит из базы и меняется из админки, поэтому регулярки собираем лениво.
    private static readonly ConcurrentDictionary<string, Regex> Patterns = new(StringComparer.Ordinal);

    private readonly ISupportKnowledgeStore _store;

    public SupportInstantAnswers(ISupportKnowledgeStore store)
    {
        _store = store;
    }

    public async Task<InstantAnswer?> TryAnswerAsync(string question, string? language, int maxWords, int maxChars)
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

        var articles = await _store.GetActiveAsync();

        foreach (var article in articles)
        {
            if (!article.InstantEnabled || article.InstantTriggers.Count == 0)
            {
                continue;
            }

            var text = article.InstantTextFor(language);
            if (string.IsNullOrWhiteSpace(text))
            {
                continue;
            }

            var matched = article.InstantTriggers.All(group =>
                group.Terms.Count > 0 && group.Terms.Any(term => Pattern(term).IsMatch(question)));

            if (matched)
            {
                return new InstantAnswer(article.Slug, text);
            }
        }

        return null;
    }

    private static Regex Pattern(string term) => Patterns.GetOrAdd(
        term,
        key => new Regex(
            $@"\b{Regex.Escape(key)}",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled));
}
