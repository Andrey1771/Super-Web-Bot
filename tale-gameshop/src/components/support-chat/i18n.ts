// Lightweight, dependency-free localization for the support widget. The project has no i18n
// framework, so we keep a small RU/EN dictionary here and pick the language from the browser.
// The backend agent already replies in the customer's language; this covers the static chrome.

export type SupportLang = "ru" | "en" | "uk" | "pl";

// The widget chrome follows the SITE language (the <html lang> attribute), not the visitor's
// browser locale — so an English site shows an English widget even for a Russian-speaking browser.
// (The AI agent replies in whatever language the customer actually types; that is handled server-side.)
// If the site later adds language switching, updating <html lang> will switch the widget too.
export const detectSupportLang = (): SupportLang => {
  const siteLang = (document.documentElement.lang || "").toLowerCase();
  if (siteLang.startsWith("ru")) return "ru";
  if (siteLang.startsWith("uk")) return "uk";
  if (siteLang.startsWith("pl")) return "pl";
  return "en";
};

type Dict = {
  title: string;
  statusOnline: string;
  statusQueue: string;
  statusAssigned: (name?: string) => string;
  statusClosed: string;
  /** Подсказка к коду обращения: зачем клиенту эти шесть символов. */
  sessionCodeHint: string;
  /** Подпись над лентой, пока подгружается предыдущая страница переписки. */
  loadingHistory: string;
  close: string;
  newChat: string;
  closedNotice: string;
  chatRestarted: string;
  /** Текст, которым мигает заголовок вкладки, пока новый ответ не увиден. */
  titleAlert: string;
  soundOff: string;
  soundOn: string;
  scrollDown: string;
  resize: string;
  today: string;
  yesterday: string;
  feedbackHelpful: string;
  feedbackNotHelpful: string;
  didNotHelp: string;
  didNotHelpTitle: string;
  rephrase: string;
  askHuman: string;
  handoffNotePlaceholder: string;
  handoffSubmit: string;
  handoffCancel: string;
  waitOpen: (minutes: number) => string;
  waitClosed: (opensAt?: string) => string;
  waitUnknown: string;
  welcomeTitle: string;
  welcomeBody: string;
  quickRepliesLabel: string;
  quickReplies: string[];
  talkToHumanMessage: string;
  composerPlaceholder: string;
  composerPlaceholderClosed: string;
  composerPlaceholderBusy: string;
  send: string;
  typingAi: string;
  typingAgent: string;
  retry: string;
  talkToHuman: string;
  errorGeneric: string;
  verifying: string;
  turnstileError: string;
  queueTitle: string;
  queueBody: string;
  contactTitle: string;
  contactBody: string;
  emailLabel: string;
  emailPlaceholder: string;
  orderLabel: string;
  orderPlaceholder: string;
  contactSubmit: string;
  contactSent: string;
  leadContinue: string;
  authorAi: string;
  authorAgent: string;
};

const en: Dict = {
  title: "Tale Shop Support",
  statusOnline: "AI assistant · online",
  statusQueue: "Connecting you to a specialist…",
  statusAssigned: (name) => `${name || "Specialist"} is with you`,
  statusClosed: "Chat closed",
  sessionCodeHint: "Your ticket code — mention it if you write to us elsewhere",
  loadingHistory: "Loading earlier messages…",
  close: "Close chat",
  newChat: "New chat",
  closedNotice: "This conversation was closed by our specialist. Start a new one if you still need help.",
  chatRestarted: "That conversation got long, so I started a fresh one — send your message again.",
  titleAlert: "💬 New reply from support",
  soundOff: "Turn the reply sound off",
  soundOn: "Turn the reply sound on",
  scrollDown: "Jump to latest",
  resize: "Resize chat",
  today: "Today",
  yesterday: "Yesterday",
  // 👍/👎 оценивают конкретный ответ, ссылка ниже зовёт живого человека — подписи
  // раньше совпадали дословно, и две разные кнопки читались как одна.
  feedbackHelpful: "This helped",
  feedbackNotHelpful: "This didn't help",
  didNotHelp: "Still stuck? Talk to a specialist",
  didNotHelpTitle: "What would help more?",
  rephrase: "Ask differently",
  askHuman: "Pass to a specialist",
  handoffNotePlaceholder: "What's going wrong? Add the order ID if you have one.",
  handoffSubmit: "Send to a specialist",
  handoffCancel: "Never mind",
  waitOpen: (minutes) => `A specialist usually replies within ${minutes} minutes — I can answer right now.`,
  waitClosed: (opensAt) =>
    opensAt
      ? `We're outside working hours — a specialist replies after ${opensAt}. I can answer right now.`
      : "We're outside working hours — a specialist replies when we're back. I can answer right now.",
  waitUnknown: "A specialist will join this chat — I can answer right now.",
  welcomeTitle: "Hi there! 👋",
  welcomeBody:
    "I’m the Tale Shop assistant. I can help with orders, keys, activation, payments and refunds — and bring in a human specialist whenever you need one.",
  quickRepliesLabel: "Popular topics",
  quickReplies: [
    "Where is my key?",
    "I have a payment issue",
    "Refund request",
    "Account & security",
    "How do I activate a key?",
  ],
  talkToHumanMessage: "I’d like to talk to a human specialist.",
  composerPlaceholder: "Type your message…",
  composerPlaceholderClosed: "This chat is closed",
  composerPlaceholderBusy: "Writing a reply…",
  send: "Send",
  typingAi: "Assistant is typing…",
  typingAgent: "Specialist is typing…",
  retry: "Retry",
  talkToHuman: "Talk to a human",
  errorGeneric: "Something went wrong. Retry or talk to a human.",
  verifying: "Just a moment — verifying you're human, then send again.",
  turnstileError: "Couldn't verify you're human.",
  queueTitle: "You’re in the queue",
  queueBody: "A Tale Shop specialist will join this chat shortly. You can keep typing — they’ll see everything.",
  contactTitle: "Help us reach you faster",
  contactBody: "Leave your email or order ID so a specialist can pick up right where we left off.",
  emailLabel: "Email",
  emailPlaceholder: "you@email.com",
  orderLabel: "Order ID",
  orderPlaceholder: "TKT-00000",
  contactSubmit: "Send to specialist",
  contactSent: "Thanks — a specialist has your details.",
  leadContinue: "Continue",
  authorAi: "Tale Support (AI)",
  authorAgent: "Tale Support (Specialist)",
};

const ru: Dict = {
  title: "Поддержка Tale Shop",
  statusOnline: "ИИ-ассистент · онлайн",
  statusQueue: "Подключаем специалиста…",
  statusAssigned: (name) => `${name || "Специалист"} на связи`,
  statusClosed: "Чат закрыт",
  sessionCodeHint: "Код обращения — назовите его, если будете писать нам другим способом",
  loadingHistory: "Загружаю предыдущие сообщения…",
  close: "Закрыть чат",
  newChat: "Новый диалог",
  closedNotice: "Специалист завершил этот диалог. Если остались вопросы — начните новый.",
  chatRestarted: "Диалог получился длинным — начал новый. Отправьте сообщение ещё раз.",
  titleAlert: "💬 Ответ от поддержки",
  soundOff: "Отключить звук ответа",
  soundOn: "Включить звук ответа",
  scrollDown: "К последнему сообщению",
  resize: "Изменить размер окна",
  today: "Сегодня",
  yesterday: "Вчера",
  feedbackHelpful: "Помогло",
  feedbackNotHelpful: "Не помогло",
  didNotHelp: "Не решилось? Позвать специалиста",
  didNotHelpTitle: "Что сделать дальше?",
  rephrase: "Спросить иначе",
  askHuman: "Передать специалисту",
  handoffNotePlaceholder: "Что именно не так? Если есть номер заказа — добавьте его.",
  handoffSubmit: "Отправить специалисту",
  handoffCancel: "Не надо",
  waitOpen: (minutes) => `Специалист обычно отвечает в течение ${minutes} минут — я могу ответить прямо сейчас.`,
  waitClosed: (opensAt) =>
    opensAt
      ? `Сейчас нерабочее время — специалист ответит после ${opensAt}. Я могу ответить прямо сейчас.`
      : "Сейчас нерабочее время — специалист ответит, когда мы вернёмся. Я могу ответить прямо сейчас.",
  waitUnknown: "Специалист подключится к чату — я могу ответить прямо сейчас.",
  welcomeTitle: "Здравствуйте! 👋",
  welcomeBody:
    "Я ассистент Tale Shop. Помогу с заказами, ключами, активацией, оплатой и возвратами — и в любой момент подключу живого специалиста.",
  quickRepliesLabel: "Популярные темы",
  quickReplies: [
    "Где мой ключ?",
    "Проблема с оплатой",
    "Хочу возврат",
    "Аккаунт и безопасность",
    "Как активировать ключ?",
  ],
  talkToHumanMessage: "Хочу связаться со специалистом.",
  composerPlaceholder: "Введите сообщение…",
  composerPlaceholderClosed: "Чат закрыт",
  composerPlaceholderBusy: "Пишу ответ…",
  send: "Отправить",
  typingAi: "Ассистент печатает…",
  typingAgent: "Специалист печатает…",
  retry: "Повторить",
  talkToHuman: "Связаться со специалистом",
  errorGeneric: "Что-то пошло не так. Повторите или свяжитесь со специалистом.",
  verifying: "Секунду — проверяем, что вы не робот, затем отправьте ещё раз.",
  turnstileError: "Не удалось подтвердить, что вы не робот.",
  queueTitle: "Вы в очереди",
  queueBody: "Специалист Tale Shop скоро подключится к чату. Можете продолжать писать — он увидит всю переписку.",
  contactTitle: "Помогите связаться с вами быстрее",
  contactBody: "Оставьте email или номер заказа — специалист продолжит с того же места.",
  emailLabel: "Email",
  emailPlaceholder: "you@email.com",
  orderLabel: "Номер заказа",
  orderPlaceholder: "TKT-00000",
  contactSubmit: "Отправить специалисту",
  contactSent: "Спасибо — специалист получил ваши данные.",
  leadContinue: "Продолжить",
  authorAi: "Tale Support (ИИ)",
  authorAgent: "Tale Support (Специалист)",
};

const uk: Dict = {
  title: "Підтримка Tale Shop",
  statusOnline: "ШІ-асистент · онлайн",
  statusQueue: "Підключаємо спеціаліста…",
  statusAssigned: (name) => `${name || "Спеціаліст"} на зв'язку`,
  statusClosed: "Чат закрито",
  sessionCodeHint: "Код звернення — назвіть його, якщо писатимете нам іншим способом",
  loadingHistory: "Завантажую попередні повідомлення…",
  close: "Закрити чат",
  newChat: "Новий діалог",
  closedNotice: "Спеціаліст завершив цей діалог. Якщо залишилися запитання — почніть новий.",
  chatRestarted: "Діалог вийшов довгим — почав новий. Надішліть повідомлення ще раз.",
  titleAlert: "💬 Відповідь від підтримки",
  soundOff: "Вимкнути звук відповіді",
  soundOn: "Увімкнути звук відповіді",
  scrollDown: "До останнього повідомлення",
  resize: "Змінити розмір вікна",
  today: "Сьогодні",
  yesterday: "Учора",
  feedbackHelpful: "Допомогло",
  feedbackNotHelpful: "Не допомогло",
  didNotHelp: "Не вирішилося? Покликати спеціаліста",
  didNotHelpTitle: "Що зробити далі?",
  rephrase: "Запитати інакше",
  askHuman: "Передати спеціалісту",
  handoffNotePlaceholder: "Що саме не так? Якщо є номер замовлення — додайте його.",
  handoffSubmit: "Надіслати спеціалісту",
  handoffCancel: "Не треба",
  waitOpen: (minutes) => `Спеціаліст зазвичай відповідає протягом ${minutes} хвилин — я можу відповісти просто зараз.`,
  waitClosed: (opensAt) =>
    opensAt
      ? `Зараз неробочий час — спеціаліст відповість після ${opensAt}. Я можу відповісти просто зараз.`
      : "Зараз неробочий час — спеціаліст відповість, коли ми повернемося. Я можу відповісти просто зараз.",
  waitUnknown: "Спеціаліст приєднається до чату — я можу відповісти просто зараз.",
  welcomeTitle: "Вітаю! 👋",
  welcomeBody:
    "Я асистент Tale Shop. Допоможу із замовленнями, ключами, активацією, оплатою та поверненнями — і будь-якої миті підключу живого спеціаліста.",
  quickRepliesLabel: "Популярні теми",
  quickReplies: [
    "Де мій ключ?",
    "Проблема з оплатою",
    "Хочу повернення",
    "Обліковий запис і безпека",
    "Як активувати ключ?",
  ],
  talkToHumanMessage: "Хочу зв'язатися зі спеціалістом.",
  composerPlaceholder: "Введіть повідомлення…",
  composerPlaceholderClosed: "Чат закрито",
  composerPlaceholderBusy: "Пишу відповідь…",
  send: "Надіслати",
  typingAi: "Асистент друкує…",
  typingAgent: "Спеціаліст друкує…",
  retry: "Повторити",
  talkToHuman: "Зв'язатися зі спеціалістом",
  errorGeneric: "Щось пішло не так. Повторіть або зв'яжіться зі спеціалістом.",
  verifying: "Секунду — перевіряємо, що ви не робот, потім надішліть ще раз.",
  turnstileError: "Не вдалося підтвердити, що ви не робот.",
  queueTitle: "Ви в черзі",
  queueBody: "Спеціаліст Tale Shop незабаром приєднається до чату. Можете продовжувати писати — він побачить усе листування.",
  contactTitle: "Допоможіть зв'язатися з вами швидше",
  contactBody: "Залиште email або номер замовлення — спеціаліст продовжить з того самого місця.",
  emailLabel: "Email",
  emailPlaceholder: "you@email.com",
  orderLabel: "Номер замовлення",
  orderPlaceholder: "TKT-00000",
  contactSubmit: "Надіслати спеціалісту",
  contactSent: "Дякуємо — спеціаліст отримав ваші дані.",
  leadContinue: "Продовжити",
  authorAi: "Tale Support (ШІ)",
  authorAgent: "Tale Support (Спеціаліст)",
};

const pl: Dict = {
  title: "Pomoc Tale Shop",
  statusOnline: "Asystent AI · online",
  statusQueue: "Łączymy ze specjalistą…",
  statusAssigned: (name) => `${name || "Specjalista"} jest z Tobą`,
  statusClosed: "Czat zamknięty",
  sessionCodeHint: "Kod zgłoszenia — podaj go, jeśli napiszesz do nas innym kanałem",
  loadingHistory: "Wczytuję wcześniejsze wiadomości…",
  close: "Zamknij czat",
  newChat: "Nowy czat",
  closedNotice: "Specjalista zakończył tę rozmowę. Jeśli nadal potrzebujesz pomocy, zacznij nową.",
  chatRestarted: "Rozmowa zrobiła się długa, więc zacząłem nową — wyślij wiadomość ponownie.",
  titleAlert: "💬 Nowa odpowiedź od pomocy",
  soundOff: "Wyłącz dźwięk odpowiedzi",
  soundOn: "Włącz dźwięk odpowiedzi",
  scrollDown: "Przejdź do najnowszych",
  resize: "Zmień rozmiar czatu",
  today: "Dzisiaj",
  yesterday: "Wczoraj",
  feedbackHelpful: "Pomogło",
  feedbackNotHelpful: "Nie pomogło",
  didNotHelp: "Nadal problem? Porozmawiaj ze specjalistą",
  didNotHelpTitle: "Co pomoże bardziej?",
  rephrase: "Zapytaj inaczej",
  askHuman: "Przekaż specjaliście",
  handoffNotePlaceholder: "Co się dzieje? Dodaj numer zamówienia, jeśli go masz.",
  handoffSubmit: "Wyślij do specjalisty",
  handoffCancel: "Nieważne",
  waitOpen: (minutes) => `Specjalista zwykle odpowiada w ciągu ${minutes} minut — ja mogę odpowiedzieć od razu.`,
  waitClosed: (opensAt) =>
    opensAt
      ? `Jesteśmy poza godzinami pracy — specjalista odpowie po ${opensAt}. Ja mogę odpowiedzieć od razu.`
      : "Jesteśmy poza godzinami pracy — specjalista odpowie, gdy wrócimy. Ja mogę odpowiedzieć od razu.",
  waitUnknown: "Specjalista dołączy do czatu — ja mogę odpowiedzieć od razu.",
  welcomeTitle: "Cześć! 👋",
  welcomeBody:
    "Jestem asystentem Tale Shop. Pomogę z zamówieniami, kluczami, aktywacją, płatnościami i zwrotami — i w każdej chwili przekażę Cię specjaliście.",
  quickRepliesLabel: "Popularne tematy",
  quickReplies: [
    "Gdzie jest mój klucz?",
    "Mam problem z płatnością",
    "Prośba o zwrot",
    "Konto i bezpieczeństwo",
    "Jak aktywować klucz?",
  ],
  talkToHumanMessage: "Chcę porozmawiać ze specjalistą.",
  composerPlaceholder: "Napisz wiadomość…",
  composerPlaceholderClosed: "Ten czat jest zamknięty",
  composerPlaceholderBusy: "Piszę odpowiedź…",
  send: "Wyślij",
  typingAi: "Asystent pisze…",
  typingAgent: "Specjalista pisze…",
  retry: "Ponów",
  talkToHuman: "Porozmawiaj z człowiekiem",
  errorGeneric: "Coś poszło nie tak. Ponów lub porozmawiaj z człowiekiem.",
  verifying: "Chwileczkę — sprawdzamy, czy nie jesteś robotem, potem wyślij ponownie.",
  turnstileError: "Nie udało się potwierdzić, że nie jesteś robotem.",
  queueTitle: "Jesteś w kolejce",
  queueBody: "Specjalista Tale Shop wkrótce dołączy do czatu. Możesz pisać dalej — zobaczy wszystko.",
  contactTitle: "Pomóż nam szybciej się z Tobą skontaktować",
  contactBody: "Zostaw e-mail lub numer zamówienia, aby specjalista mógł kontynuować od tego miejsca.",
  emailLabel: "E-mail",
  emailPlaceholder: "you@email.com",
  orderLabel: "Numer zamówienia",
  orderPlaceholder: "TKT-00000",
  contactSubmit: "Wyślij do specjalisty",
  contactSent: "Dzięki — specjalista ma Twoje dane.",
  leadContinue: "Kontynuuj",
  authorAi: "Tale Support (AI)",
  authorAgent: "Tale Support (Specjalista)",
};

const dictionaries: Record<SupportLang, Dict> = { en, ru, uk, pl };

export const getSupportDict = (lang: SupportLang): Dict => dictionaries[lang] ?? en;
