import { useSyncExternalStore } from "react";

// Site-wide language + currency preferences, kept in ONE place so the header, footer and
// support chat all read/write the same source. Language drives <html lang> (the single
// signal the whole i18n / chat pipeline follows); currency is a display preference used by
// formatMoney(). Persisted to localStorage and synced across tabs via the `storage` event.

export type LangCode = "en" | "ru" | "uk" | "pl";
export type CurrencyCode = "USD" | "EUR" | "UAH" | "PLN";

export interface LanguageOption {
  code: LangCode;
  label: string;
  short: string;
}

export interface CurrencyOption {
  code: CurrencyCode;
  label: string;
  symbol: string;
  /** Indicative rate vs USD. Placeholder — wire to a real FX source before production. */
  rate: number;
}

export const LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English", short: "EN" },
  { code: "ru", label: "Русский", short: "RU" },
  { code: "uk", label: "Українська", short: "UK" },
  { code: "pl", label: "Polski", short: "PL" },
];

export const CURRENCIES: CurrencyOption[] = [
  { code: "USD", label: "US Dollar", symbol: "$", rate: 1 },
  { code: "EUR", label: "Euro", symbol: "€", rate: 0.92 },
  { code: "UAH", label: "Hryvnia", symbol: "₴", rate: 41 },
  { code: "PLN", label: "Złoty", symbol: "zł", rate: 4.0 },
];

const LANG_KEY = "site_lang";
const CURRENCY_KEY = "site_currency";

const isBrowser = typeof window !== "undefined";

function readLang(): LangCode {
  if (!isBrowser) return "en";
  const stored = window.localStorage.getItem(LANG_KEY) || document.documentElement.lang;
  const match = LANGUAGES.find((l) => l.code === stored);
  return match ? match.code : "en";
}

function readCurrency(): CurrencyCode {
  if (!isBrowser) return "USD";
  const stored = window.localStorage.getItem(CURRENCY_KEY);
  const match = CURRENCIES.find((c) => c.code === stored);
  return match ? match.code : "USD";
}

// Cached snapshot — useSyncExternalStore requires getSnapshot to return a stable reference
// until something actually changes, otherwise React re-renders in a loop.
let snapshot: { lang: LangCode; currency: CurrencyCode } = {
  lang: readLang(),
  currency: readCurrency(),
};

// Apply the saved language to the document as soon as this module loads, so the whole app
// (not just the footer) starts in the user's chosen language on first paint.
if (isBrowser) {
  document.documentElement.lang = snapshot.lang;
}

const listeners = new Set<() => void>();

function refresh() {
  const next = { lang: readLang(), currency: readCurrency() };
  if (next.lang !== snapshot.lang || next.currency !== snapshot.currency) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }
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
  if (isBrowser) {
    try {
      window.localStorage.setItem(CURRENCY_KEY, currency);
    } catch {
      /* storage unavailable */
    }
  }
  refresh();
}

/** Format a USD base amount in the user's selected currency (indicative rates). */
export function formatMoney(usdAmount: number, currency: CurrencyCode): string {
  const option = CURRENCIES.find((c) => c.code === currency) ?? CURRENCIES[0];
  const converted = usdAmount * option.rate;
  const rounded = converted >= 100 ? Math.round(converted) : Number(converted.toFixed(2));
  // Фиксированная локаль: остальной сайт пишет цены как "$32.00", а локаль ОС пользователя
  // давала "$32,00" — смесь символа и разделителя из разных миров.
  const body = rounded.toLocaleString("en-US", {
    minimumFractionDigits: converted >= 100 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  // Symbols like "zł" read better as a suffix; single-glyph symbols stay as a prefix.
  return option.symbol.length > 1 ? `${body} ${option.symbol}` : `${option.symbol}${body}`;
}

export function useSitePreferences() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    lang: state.lang,
    currency: state.currency,
    setLang,
    setCurrency,
    languages: LANGUAGES,
    currencies: CURRENCIES,
  };
}
