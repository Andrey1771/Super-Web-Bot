import { useSyncExternalStore } from "react";
import { formatMoney, FALLBACK_CURRENCY } from "../utils/format-money";
import { applyLanguage } from "../i18n";

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
const COUNTRY_KEY = "site_country";

/** Страна для переключателя в шапке. */
export interface CountryOption {
  code: string;
  name: string;
}

const isBrowser = typeof window !== "undefined";

/** Язык браузера, если он среди поддерживаемых: «ru-RU» → «ru». Иначе null. */
function browserLang(): LangCode | null {
  if (!isBrowser) return null;
  const candidates = [...(navigator.languages ?? []), navigator.language].filter(Boolean);
  for (const candidate of candidates) {
    const code = candidate.toLowerCase().split("-")[0];
    const match = LANGUAGES.find((l) => l.code === code);
    if (match) return match.code;
  }
  return null;
}

/** Язык из адреса страницы (?lang=ru) — так выглядят ссылки на языковые версии в hreflang и карте сайта. */
function queryLang(): LangCode | null {
  if (!isBrowser) return null;
  try {
    const code = new URLSearchParams(window.location.search).get("lang");
    const match = LANGUAGES.find((l) => l.code === code);
    return match ? match.code : null;
  } catch {
    return null;
  }
}

function readLang(): LangCode {
  if (!isBrowser) return "en";
  // Адрес с ?lang= — ссылка на языковую версию: он главнее сохранённого выбора и сам становится выбором,
  // чтобы переход по внутренним ссылкам (уже без параметра) не сбросил язык.
  const fromQuery = queryLang();
  if (fromQuery) {
    try {
      window.localStorage.setItem(LANG_KEY, fromQuery);
    } catch {
      /* storage unavailable */
    }
    return fromQuery;
  }
  // Явный выбор (localStorage) главнее; без него — язык браузера, а не английский по умолчанию.
  const stored = window.localStorage.getItem(LANG_KEY);
  const match = LANGUAGES.find((l) => l.code === stored);
  if (match) return match.code;
  return browserLang() ?? "en";
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

/**
 * Валюта страны. Список неполный намеренно: сюда попали страны, чьи валюты магазин в принципе
 * может продавать. Отсутствующая страна — не ошибка: покупатель получит базовую валюту, а это
 * честнее, чем показать цену в валюте, в которой у товаров нет прайс-листа.
 */
const COUNTRY_CURRENCY: Record<string, string> = {
  // Еврозона и страны, использующие евро де-факто.
  AD: "EUR", AT: "EUR", BE: "EUR", CY: "EUR", DE: "EUR", EE: "EUR", ES: "EUR", FI: "EUR",
  FR: "EUR", GR: "EUR", HR: "EUR", IE: "EUR", IT: "EUR", LT: "EUR", LU: "EUR", LV: "EUR",
  MC: "EUR", ME: "EUR", MT: "EUR", NL: "EUR", PT: "EUR", SI: "EUR", SK: "EUR", SM: "EUR",
  // Свои валюты.
  AU: "AUD", BG: "BGN", BR: "BRL", BY: "BYN", CA: "CAD", CH: "CHF", CN: "CNY", CZ: "CZK",
  DK: "DKK", GB: "GBP", HU: "HUF", IN: "INR", JP: "JPY", KR: "KRW", KZ: "KZT", MX: "MXN",
  NO: "NOK", NZ: "NZD", PL: "PLN", RO: "RON", RS: "RSD", RU: "RUB", SE: "SEK", TR: "TRY",
  UA: "UAH", US: "USD",
};

/**
 * Валюта по стране покупателя, а если страны ещё не знаем — по часовому поясу.
 *
 * Страна точнее пояса: её присылает сервер по IP, а пояс — лишь косвенный признак, который
 * к тому же покрывает одну Европу. Пояс остаётся запасным вариантом на те секунды, пока
 * ответ сервера не пришёл, и на случай, когда гео недоступно вовсе.
 */
function guessCurrencyByRegion(): string | null {
  if (!isBrowser) return null;

  const country = readStoredCountry() ?? detectedCountry;
  if (country) {
    const byCountry = COUNTRY_CURRENCY[country];
    if (byCountry) {
      return byCountry;
    }
  }

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
let countryCatalog: CountryOption[] = [];
let detectedCountry: string | null = null;

function readStoredCountry(): string | null {
  if (!isBrowser) return null;
  try {
    const stored = window.localStorage.getItem(COUNTRY_KEY);
    return stored && /^[A-Z]{2}$/.test(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Страна по часовому поясу — только первая догадка, пока ни сервер (гео по IP), ни сам покупатель
 * страну не назвали. Часовой пояс однозначно страну не даёт, поэтому список короткий и осторожный.
 */
const TIMEZONE_COUNTRY: Array<{ prefix: string; country: string }> = [
  { prefix: "Europe/Moscow", country: "RU" },
  { prefix: "Europe/Kyiv", country: "UA" },
  { prefix: "Europe/Kiev", country: "UA" },
  { prefix: "Europe/Warsaw", country: "PL" },
  { prefix: "Europe/Berlin", country: "DE" },
  { prefix: "Europe/London", country: "GB" },
  { prefix: "Europe/Paris", country: "FR" },
  { prefix: "Europe/Madrid", country: "ES" },
  { prefix: "Europe/Rome", country: "IT" },
  { prefix: "Europe/Istanbul", country: "TR" },
  { prefix: "Asia/Almaty", country: "KZ" },
  { prefix: "Asia/Tokyo", country: "JP" },
  { prefix: "Asia/Shanghai", country: "CN" },
  { prefix: "America/Sao_Paulo", country: "BR" },
  { prefix: "America/Toronto", country: "CA" },
  { prefix: "America/", country: "US" },
  { prefix: "Australia/", country: "AU" },
];

function guessCountryByTimeZone(): string | null {
  if (!isBrowser) return null;
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    return TIMEZONE_COUNTRY.find((rule) => timeZone.startsWith(rule.prefix))?.country ?? null;
  } catch {
    return null;
  }
}

/** Откуда взялась страна: сам выбрал / гео по IP от сервера / догадка по часовому поясу. */
export type CountrySource = "user" | "geo" | "timezone";

/** Страна покупателя: свой выбор → гео от сервера → часовой пояс → неизвестно. */
function resolveCountry(): { country: string | null; source: CountrySource | null } {
  const stored = readStoredCountry();
  if (stored) return { country: stored, source: "user" };
  if (detectedCountry) return { country: detectedCountry, source: "geo" };
  const guessed = guessCountryByTimeZone();
  return guessed ? { country: guessed, source: "timezone" } : { country: null, source: null };
}

const initialCountry = resolveCountry();

let snapshot: {
  lang: LangCode;
  currency: string;
  baseCurrency: string;
  currencies: CurrencyOption[];
  country: string | null;
  countrySource: CountrySource | null;
  /** Страна по IP (от CDN/прокси), независимо от выбора, — для предупреждения о VPN/прокси. */
  ipCountry: string | null;
  countries: CountryOption[];
} = {
  lang: readLang(),
  currency: resolveCurrency(),
  baseCurrency: baseCode,
  currencies: supportedCodes.map(currencyOption),
  country: initialCountry.country,
  countrySource: initialCountry.source,
  ipCountry: null,
  countries: countryCatalog,
};

// Apply the saved language to the document as soon as this module loads, so the whole app
// (not just the footer) starts in the user's chosen language on first paint.
if (isBrowser) {
  document.documentElement.lang = snapshot.lang;
  // Словарь выбранного языка подгружается сразу: страница рисуется на нём, а не на английском с перещёлкиванием.
  void applyLanguage(snapshot.lang);
}

const listeners = new Set<() => void>();

function refresh() {
  const nextLang = readLang();
  const nextCurrency = resolveCurrency();
  const currenciesChanged =
    snapshot.currencies.length !== supportedCodes.length ||
    snapshot.currencies.some((option, index) => option.code !== supportedCodes[index]);

  const nextCountry = resolveCountry();
  const countriesChanged = snapshot.countries !== countryCatalog;

  if (
    nextLang !== snapshot.lang ||
    nextCurrency !== snapshot.currency ||
    baseCode !== snapshot.baseCurrency ||
    currenciesChanged ||
    nextCountry.country !== snapshot.country ||
    nextCountry.source !== snapshot.countrySource ||
    detectedCountry !== snapshot.ipCountry ||
    countriesChanged
  ) {
    snapshot = {
      lang: nextLang,
      currency: nextCurrency,
      baseCurrency: baseCode,
      currencies: currenciesChanged ? supportedCodes.map(currencyOption) : snapshot.currencies,
      country: nextCountry.country,
      countrySource: nextCountry.source,
      ipCountry: detectedCountry,
      countries: countryCatalog,
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

/**
 * Страны для переключателя и гео-страна от сервера (если прокси/CDN её передал). Как и с валютой,
 * ошибку глотаем: без списка переключатель просто не покажется, а догадка по поясу останется.
 */
async function loadStorefrontRegion(): Promise<void> {
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    const chosen = readStoredCountry();
    if (chosen) headers["X-Buyer-Country"] = chosen;
    const response = await fetch(`${apiBaseUrl()}/api/storefront/region`, { headers });
    if (!response.ok) return;
    const payload = await response.json();
    const list: unknown = payload?.countries;
    if (Array.isArray(list)) {
      countryCatalog = list
        .filter((row): row is { code: string; name: string } => typeof row?.code === "string" && typeof row?.name === "string")
        .map((row) => ({ code: row.code.toUpperCase(), name: row.name }));
    }
    const detected = payload?.detectedCountry;
    detectedCountry = typeof detected === "string" && /^[A-Z]{2}$/i.test(detected) ? detected.toUpperCase() : null;
    refresh();
  } catch {
    /* оффлайн или CORS — остаёмся с догадкой по часовому поясу */
  }
}

if (isBrowser) {
  void loadStorefrontCurrency();
  void loadStorefrontRegion();
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key === LANG_KEY || event.key === CURRENCY_KEY || event.key === COUNTRY_KEY) {
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
    // В адресе стоит ?lang= — держим его в согласии с выбором, иначе перезагрузка вернула бы прежний язык.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("lang")) {
        if (lang === "en") url.searchParams.delete("lang");
        else url.searchParams.set("lang", lang);
        window.history.replaceState(window.history.state, "", url.toString());
      }
    } catch {
      /* адрес не разобрался — оставляем как есть */
    }
  }
  refresh();
  // Переводы интерфейса: i18next догружает словарь и перерисовывает всё, что использует useTranslation.
  void applyLanguage(lang);
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

/** Страна покупателя — где он будет активировать ключ. Влияет на предупреждения о регионе и на выдачу ключа. */
export function setCountry(country: string | null) {
  if (isBrowser) {
    try {
      if (country && /^[A-Z]{2}$/i.test(country)) {
        window.localStorage.setItem(COUNTRY_KEY, country.toUpperCase());
      } else {
        window.localStorage.removeItem(COUNTRY_KEY);
      }
    } catch {
      /* storage unavailable */
    }
  }
  refresh();
}

/** Страна вне React — для слоя API: уходит заголовком X-Buyer-Country в каждый запрос. */
export function currentCountry(): string | null {
  return snapshot.country;
}

/**
 * Язык сайта вне React — для слоя API: уходит заголовком Accept-Language в каждый запрос.
 * Сервер запоминает его в заказе и шлёт письма о ключах, возвратах и кэшбэке на этом языке.
 */
export function currentLang(): LangCode {
  return snapshot.lang;
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
    /** Страна активации ключа (ISO alpha-2) или null, если определить не удалось. */
    country: state.country,
    /** Откуда страна: "user" — выбрал сам, "geo" — по IP, "timezone" — догадка по часовому поясу. */
    countrySource: state.countrySource,
    /** Страна по IP от сервера (если прокси/CDN её передал) — для предупреждения о VPN/прокси. */
    ipCountry: state.ipCountry,
    countries: state.countries,
    setCountry,
  };
}
