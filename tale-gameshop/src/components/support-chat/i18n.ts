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
  minimize: string;
  close: string;
  welcomeTitle: string;
  welcomeBody: string;
  quickRepliesLabel: string;
  quickReplies: string[];
  talkToHumanMessage: string;
  composerPlaceholder: string;
  composerPlaceholderClosed: string;
  send: string;
  note: string;
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
  you: string;
};

const en: Dict = {
  title: "Tale Shop Support",
  statusOnline: "AI assistant · online",
  statusQueue: "Connecting you to a specialist…",
  statusAssigned: (name) => `${name || "Specialist"} is with you`,
  statusClosed: "Chat closed",
  minimize: "Minimize chat",
  close: "Close chat",
  welcomeTitle: "Hi there! 👋",
  welcomeBody:
    "I’m the Tale Shop assistant. I can help with orders, keys, activation, payments and refunds — and bring in a human specialist whenever you need one.",
  quickRepliesLabel: "Popular topics",
  quickReplies: [
    "Where is my key?",
    "I have a payment issue",
    "Refund request",
    "Account & security",
    "Talk to a human",
  ],
  talkToHumanMessage: "I’d like to talk to a human specialist.",
  composerPlaceholder: "Type your message…",
  composerPlaceholderClosed: "This chat is closed",
  send: "Send",
  note: "AI-powered · a human specialist can join anytime",
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
  you: "You",
};

const ru: Dict = {
  title: "Поддержка Tale Shop",
  statusOnline: "ИИ-ассистент · онлайн",
  statusQueue: "Подключаем специалиста…",
  statusAssigned: (name) => `${name || "Специалист"} на связи`,
  statusClosed: "Чат закрыт",
  minimize: "Свернуть чат",
  close: "Закрыть чат",
  welcomeTitle: "Здравствуйте! 👋",
  welcomeBody:
    "Я ассистент Tale Shop. Помогу с заказами, ключами, активацией, оплатой и возвратами — и в любой момент подключу живого специалиста.",
  quickRepliesLabel: "Популярные темы",
  quickReplies: [
    "Где мой ключ?",
    "Проблема с оплатой",
    "Хочу возврат",
    "Аккаунт и безопасность",
    "Связаться со специалистом",
  ],
  talkToHumanMessage: "Хочу связаться со специалистом.",
  composerPlaceholder: "Введите сообщение…",
  composerPlaceholderClosed: "Чат закрыт",
  send: "Отправить",
  note: "На базе ИИ · живой специалист подключится при необходимости",
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
  you: "Вы",
};

const dictionaries: Record<SupportLang, Dict> = { en, ru };

export const getSupportDict = (lang: SupportLang): Dict => dictionaries[lang] ?? en;
