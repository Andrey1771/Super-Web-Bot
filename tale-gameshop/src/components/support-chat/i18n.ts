// Lightweight, dependency-free localization for the support widget. The project has no i18n
// framework, so we keep a small RU/EN dictionary here and pick the language from the browser.
// The backend agent already replies in the customer's language; this covers the static chrome.

export type SupportLang = "ru" | "en";

// The widget chrome follows the SITE language (the <html lang> attribute), not the visitor's
// browser locale — so an English site shows an English widget even for a Russian-speaking browser.
// (The AI agent replies in whatever language the customer actually types; that is handled server-side.)
// If the site later adds language switching, updating <html lang> will switch the widget too.
export const detectSupportLang = (): SupportLang => {
  const siteLang = (document.documentElement.lang || "").toLowerCase();
  if (siteLang.startsWith("ru")) return "ru";
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

const dictionaries: Record<SupportLang, Dict> = { en, ru };

export const getSupportDict = (lang: SupportLang): Dict => dictionaries[lang] ?? en;
