import { useSyncExternalStore } from "react";
import { formatMoney, FALLBACK_CURRENCY } from "../utils/format-money";

// Site-wide language + currency preferences, kept in ONE place so the header, footer and
// support chat all read/write the same source. Language drives <html lang> (the single
// signal the whole i18n / chat pipeline follows).
//
// Валюта: список доступных валют приходит С СЕРВЕРА (/api/storefront/currency) и совпадает
// с валютой, в которой сервер считает чекаут. Раньше здесь лежал захардкоженный список
// USD/EUR/UAH/PLN с выдуманными курсами ("rate: 0.92"), и переключатель показывал цену,
// которую никто не собирался списывать: витрина рисовала ₴, а Stripe брал доллары.
// Пока в каталоге одна цена без валюты, сервер отдаёт ровно одну валюту, и переключатель
// прячется. Появятся прайс-листы и курсы — список расширится на сервере, и переключатель
// оживёт сам, без правок фронта.

export type LangCode = "en" | "ru" | "uk" | "pl";
export type CurrencyCode = string;

export interface LanguageOption {
  code: LangCode;
  label: string;
  short: string;
}

export interface CurrencyOption {
  code: CurrencyCode;
  label: string;
  symbol: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English", short: "EN" },
  { code: "ru", label: "Русский", short: "RU" },
  { code: "uk", label: "Українська", short: "UK" },
  { code: "pl", label: "Polski", short: "PL" },
];

/** Витринные подписи валют. Что из этого реально доступно — решает сервер. */
const CURRENCY_META: Record<string, { label: string; symbol: string }> = {
  USD: { label: "US Dollar", symbol: "$" },
  EUR: { label: "Euro", symbol: "€" },
  RUB: { label: "Russian Ruble", symbol: "₽" },
  UAH: { label: "Hryvnia", symbol: "₴" },
  PLN: { label: "Złoty", symbol: "zł" },
  KZT: { label: "Tenge", symbol: "₸" },
  GBP: { label: "Pound Sterling", symbol: "£" },
  JPY: { label: "Japanese Yen", symbol: "¥" },
};

function currencyOption(code: string): CurrencyOption {
  const meta = CURRENCY_META[code];
  return { code, label: meta?.label ?? code, symbol: meta?.symbol ?? code };
}

const LANG_KEY = "site_lang";
const CURRENCY_KEY = "site_currency";

const isBrowser = typeof window !== "undefined";

function readLang(): LangCode {
  if (!isBrowser) return "en";
  const stored = window.localStorage.getItem(LANG_KEY) || document.documentElement.lang;
  const match = LANGUAGES.find((l) => l.code === stored);
  return match ? match.code : "en";
}

function readStoredCurrency(): string | null {
  if (!isBrowser) return null;
  try {
    return window.localStorage.getItem(CURRENCY_KEY);
  } catch {
    return null;
  }
}

// Что сервер разрешил показывать. До ответа — только базовая валюта: показать лишнее
// и списать другое хуже, чем на секунду показать меньше вариантов.
let supportedCodes: string[] = [FALLBACK_CURRENCY];
// Валюта каталога и расчёта. Админка показывает цены товара именно в ней —
// её вводит контент-менеджер, и она не зависит от того, что выбрал покупатель.
let baseCode: string = FALLBACK_CURRENCY;

/**
 * Валюта из адреса: `?currency=EUR`. Ссылка сильнее прошлого выбора — иначе поделиться
 * каталогом в евро было бы нельзя, получатель увидел бы цены в своей валюте.
 * Выбор из ссылки сразу сохраняется, чтобы он пережил переход на соседнюю страницу.
 */
function readCurrencyFromUrl(): string | null {
  if (!isBrowser) return null;
  try {
    const requested = new URLSearchParams(window.location.search).get("currency");
    return requested ? requested.trim().toUpperCase() : null;
  } catch {
    return null;
  }
}

/**
 * Валюта страны по часовому поясу браузера. Нужна только при первом визите: выбора ещё нет,
 * и показать европейцу цены в евро (если магазин их ведёт) лучше, чем доллары по умолчанию.
 * Часовой пояс, а не язык: язык интерфейса и страна покупки — разные вещи, английский
 * стоит у половины мира.
 */
const TIMEZONE_CURRENCY: Array<{ prefix: string; currency: string }> = [
  { prefix: "Europe/Moscow", currency: "RUB" },
  { prefix: "Europe/", currency: "EUR" },
];

function guessCurrencyByRegion(): string | null {
  if (!isBrowser) return null;
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    // Порядок важен: Europe/Moscow должен сработать раньше общего Europe/.
    const match = TIMEZONE_CURRENCY.find((rule) => timeZone.startsWith(rule.prefix));
    return match ? match.currency : null;
  } catch {
    return null;
  }
}

/**
 * Выбранная валюта, приведённая к списку разрешённых. Порядок источников: адрес → сохранённый
 * выбор → страна → базовая. Пользователь мог сохранить UAH, пока переключатель ещё врал, —
 * такой выбор молча возвращаем к базовой валюте.
 */
function resolveCurrency(): string {
  const fromUrl = readCurrencyFromUrl();
  if (fromUrl && supportedCodes.includes(fromUrl)) {
    return fromUrl;
  }

  const stored = readStoredCurrency();
  if (stored && supportedCodes.includes(stored)) {
    return stored;
  }

  // Гео-догадка только когда своего выбора ещё не было: переехавшему покупателю
  // не должно внезапно менять валюту в следующей поездке.
  if (!stored) {
    const guessed = guessCurrencyByRegion();
    if (guessed && supportedCodes.includes(guessed)) {
      return guessed;
    }
  }

  return supportedCodes[0];
}

// Cached snapshot — useSyncExternalStore requires getSnapshot to return a stable reference
// until something actually changes, otherwise React re-renders in a loop.
let snapshot: { lang: LangCode; currency: string; baseCurrency: string; currencies: CurrencyOption[] } = {
  lang: readLang(),
  currency: resolveCurrency(),
  baseCurrency: baseCode,
  currencies: supportedCodes.map(currencyOption),
};

// Apply the saved language to the document as soon as this module loads, so the whole app
// (not just the footer) starts in the user's chosen language on first paint.
if (isBrowser) {
  document.documentElement.lang = snapshot.lang;
}

const listeners = new Set<() => void>();

function refresh() {
  const nextLang = readLang();
  const nextCurrency = resolveCurrency();
  const currenciesChanged =
    snapshot.currencies.length !== supportedCodes.length ||
    snapshot.currencies.some((option, index) => option.code !== supportedCodes[index]);

  if (
    nextLang !== snapshot.lang ||
    nextCurrency !== snapshot.currency ||
    baseCode !== snapshot.baseCurrency ||
    currenciesChanged
  ) {
    snapshot = {
      lang: nextLang,
      currency: nextCurrency,
      baseCurrency: baseCode,
      currencies: currenciesChanged ? supportedCodes.map(currencyOption) : snapshot.currencies,
    };
    listeners.forEach((listener) => listener());
  }
}

function apiBaseUrl(): string {
  return window.__APP_CONFIG__?.apiBaseUrl ?? "http://localhost:7002";
}

/**
 * Забирает у сервера валюту витрины. Ошибку глотаем намеренно: базовая валюта уже стоит
 * по умолчанию, и сеть не должна мешать показать каталог.
 */
async function loadStorefrontCurrency(): Promise<void> {
  try {
    const response = await fetch(`${apiBaseUrl()}/api/storefront/currency`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return;

    const payload = await response.json();
    const codes: unknown = payload?.supportedCurrencies;
    if (!Array.isArray(codes) || codes.length === 0) return;

    const normalized = codes
      .filter((code): code is string => typeof code === "string" && code.trim().length > 0)
      .map((code) => code.trim().toUpperCase());
    if (normalized.length === 0) return;

    supportedCodes = normalized;

    const base = payload?.baseCurrency;
    baseCode = typeof base === "string" && base.trim()
      ? base.trim().toUpperCase()
      : normalized[0];

    // Валюту из ссылки запоминаем: список валют приходит уже после первого рендера,
    // и до него проверить, разрешена ли она, было нечем. Иначе выбор жил бы ровно
    // до перехода на соседнюю страницу.
    const fromUrl = readCurrencyFromUrl();
    if (fromUrl && supportedCodes.includes(fromUrl) && readStoredCurrency() !== fromUrl) {
      try {
        window.localStorage.setItem(CURRENCY_KEY, fromUrl);
      } catch {
        /* приватный режим — валюта проживёт до конца сессии */
      }
    }

    refresh();
  } catch {
    /* оффлайн или CORS — остаёмся на базовой валюте */
  }
}

if (isBrowser) {
  void loadStorefrontCurrency();
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key === LANG_KEY || event.key === CURRENCY_KEY) {
      refresh();
    }
  };
  if (isBrowser) {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(callback);
    if (isBrowser) {
      window.removeEventListener("storage", onStorage);
    }
  };
}

function getSnapshot() {
  return snapshot;
}

export function setLang(lang: LangCode) {
  if (isBrowser) {
    try {
      window.localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* storage unavailable */
    }
    document.documentElement.lang = lang;
  }
  refresh();
}

export function setCurrency(currency: CurrencyCode) {
  // Выбрать валюту, которой нет в списке сервера, нельзя: именно так на витрине
  // появлялись цены, не совпадающие с суммой списания.
  if (!supportedCodes.includes(currency)) return;

  if (isBrowser) {
    try {
      window.localStorage.setItem(CURRENCY_KEY, currency);
    } catch {
      /* storage unavailable */
    }
  }
  refresh();
}

// Форматтер живёт в utils/format-money и НЕ конвертирует валюты. Ре-экспорт оставлен,
// чтобы существующие импорты из этого модуля продолжали работать.
export { formatMoney };

/**
 * Выбранная валюта вне React — для слоя API, который хуками пользоваться не может.
 * Каталог обязан запрашиваться в той же валюте, в которой витрина будет показывать цены:
 * сервер вернёт суммы уже в ней, и разойтись с показом станет физически нечему.
 */
export function currentCurrency(): string {
  return snapshot.currency;
}

export function useSitePreferences() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    lang: state.lang,
    currency: state.currency,
    /** Валюта каталога — для админских экранов, где цена товара не зависит от покупателя. */
    baseCurrency: state.baseCurrency,
    setLang,
    setCurrency,
    languages: LANGUAGES,
    currencies: state.currencies,
    /** Переключатель показываем только когда есть из чего выбирать. */
    canSwitchCurrency: state.currencies.length > 1,
  };
}
