/**
 * Первое касание: как посетитель нашёл магазин.
 *
 * Запоминается ОДИН раз — при первом заходе — и больше не перезаписывается. Последнее касание
 * почти всегда «прямой заход» или поиск по названию магазина: человек уже знает, куда идёт.
 * Деньги приносит то, что привело его впервые, и сопоставлять с расходами на рекламу нужно
 * именно это.
 *
 * Хранится у самого посетителя (localStorage) и уходит на сервер только вместе с оформлением
 * заказа. Данные первой стороны: метки из адресной строки и адрес перехода — то же, что видно
 * в логах веб-сервера, никакой передачи третьим лицам здесь нет.
 */

const STORAGE_KEY = "taleshop.attribution";

export type Attribution = {
  source?: string;
  medium?: string;
  campaign?: string;
  referrer?: string;
  landingPath?: string;
  firstSeenUtc?: string;
};

/** Домен перехода без www — «google.com», «t.me». Свой домен источником не считается. */
const referrerSource = (referrer: string): string | undefined => {
  try {
    const url = new URL(referrer);
    if (url.hostname === window.location.hostname) {
      return undefined;
    }
    return url.hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
};

const read = (): Attribution | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Attribution) : null;
  } catch {
    // Приватный режим или запрет на хранилище — атрибуции просто не будет.
    return null;
  }
};

/**
 * Снять первое касание, если его ещё нет. Вызывается один раз при старте приложения.
 * Повторный вызов ничего не меняет: перезапись превратила бы первое касание в последнее.
 */
export const captureAttribution = (): void => {
  if (read()) {
    return;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const referrer = document.referrer || "";
    const fromReferrer = referrerSource(referrer);

    const attribution: Attribution = {
      source: params.get("utm_source") ?? fromReferrer ?? undefined,
      medium: params.get("utm_medium") ?? (fromReferrer ? "referral" : undefined),
      campaign: params.get("utm_campaign") ?? undefined,
      referrer: referrer || undefined,
      landingPath: window.location.pathname + window.location.search,
      firstSeenUtc: new Date().toISOString(),
    };

    // Совсем пустую запись всё равно сохраняем: «пришёл сам» — это тоже ответ, и без записи
    // мы бы снимали атрибуцию заново на каждой странице, подменяя первое касание последним.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // Хранилище недоступно — работаем без атрибуции.
  }
};

export const getAttribution = (): Attribution | undefined => read() ?? undefined;
