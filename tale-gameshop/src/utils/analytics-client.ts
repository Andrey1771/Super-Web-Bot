import type { AnalyticsPublicSettings } from "../types/analytics";
import { isAnalyticsAvailable } from "./analytics-state";

type EcommerceItem = {
  item_id: string;
  /** Название. Необязательно: там, где известен только идентификатор товара (избранное),
      пустая строка в отчётах хуже отсутствия — она рисует безымянные строки. */
  item_name?: string;
  price?: number;
  item_category?: string;
  /** Издание (Standard / Deluxe) — стандартное поле GA4 для варианта товара. */
  item_variant?: string;
  quantity?: number;
  /** Место в подборке: по нему видно, кликают ли дальше первого ряда. */
  index?: number;
};

type EcommercePayload = {
  currency?: string;
  value?: number;
  items: EcommerceItem[];
  transaction_id?: string;
  /** Имя подборки — для view_item_list и select_item. */
  item_list_name?: string;
  /** Способ оплаты — стандартное поле add_payment_info. */
  payment_type?: string;
};

type EventPayload = Record<string, string | number | boolean | undefined>;

type PageViewPayload = {
  path: string;
  title?: string;
};

declare global {
  interface Window {
    dataLayer?: Array<any>;
    gtag?: (...args: any[]) => void;
  }
}

let settings: AnalyticsPublicSettings | null = null;
let consentGranted = false;
let initialized = false;
/**
 * Постоянный идентификатор вошедшего покупателя (Keycloak sub).
 *
 * Без него Google считает людей по куке браузера: один человек с телефона и с ноутбука — два
 * «пользователя», а покупка не связывается с визитом, где он выбирал игру. С ним GA сшивает
 * устройства и сессии.
 *
 * Это псевдоним, а не почта и не имя: наружу личные данные не уходят.
 */
let userId: string | null = null;
let initializingPromise: Promise<void> | null = null;
let pendingPageView: PageViewPayload | null = null;

const loadScript = (src: string, id: string) =>
  new Promise<void>((resolve, reject) => {
    if (document.getElementById(id)) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.id = id;
    script.async = true;
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script ${src}`));
    document.head.appendChild(script);
  });

/**
 * Свои адреса вместо доменов Google (проксирует nginx, см. location /st/ в nginx.conf).
 *
 * Блокировщик срабатывает на адрес: и скрипт счётчика, и приём событий у Google лежат по
 * путям, которые есть в каждом списке фильтров. Со своего домена это обычные запросы к сайту.
 */
const TAG_SCRIPT_PATH = "/st/t";
const GTM_SCRIPT_PATH = "/st/c";
const COLLECT_PATH = "/st";

/**
 * Загрузился ли настоящий счётчик. Проверка нужна там, где прокси нет — на дев-сервере
 * неизвестный путь отдаёт index.html, скрипт «успешно» грузится, а счётчика нет.
 * gtag.js при выполнении заводит google_tag_manager — по нему это и видно.
 */
const tagLoaded = () => Boolean((window as any).google_tag_manager);

const initGa = async (measurementId: string) => {
  // Сначала через свой домен; если прокси нет или он не отдал скрипт — напрямую, как раньше.
  let transportUrl: string | null = `${window.location.origin}${COLLECT_PATH}`;
  try {
    await loadScript(`${TAG_SCRIPT_PATH}?id=${measurementId}`, "ga4-script");
  } catch {
    // Молча: ниже всё равно проверяем, появился ли счётчик.
  }

  if (!tagLoaded()) {
    transportUrl = null;
    await loadScript(`https://www.googletagmanager.com/gtag/js?id=${measurementId}`, "ga4-script-direct");
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // Именно arguments, а не массив. gtag.js разбирает очередь dataLayer и признаёт командой
    // только объект arguments: массив он молча пропускает. Со стороны это выглядит идеально —
    // счётчик загружен, ошибок нет, dataLayer наполняется, — а до Google не уходит ничего,
    // даже конфигурация. Отсюда и пустая статистика: события были, отправки не было.
    window.dataLayer?.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    send_page_view: false,
    anonymize_ip: true,
    // Куда gtag шлёт события: к адресу дописывается /g/collect. Без этого он пойдёт на
    // google-analytics.com, и весь смысл проксирования скрипта пропадёт.
    ...(transportUrl ? { transport_url: transportUrl } : {}),
    // Если вход случился до загрузки счётчика, идентификатор ставится сразу в конфигурацию:
    // иначе первые события ушли бы безымянными и не склеились бы с остальными.
    ...(userId ? { user_id: userId } : {}),
  });
};

const initGtm = async (containerId: string) => {
  window.dataLayer = window.dataLayer || [];
  try {
    await loadScript(`${GTM_SCRIPT_PATH}?id=${containerId}`, "gtm-script");
  } catch {
    // Тот же запасной путь, что и у счётчика.
  }

  if (!tagLoaded()) {
    await loadScript(`https://www.googletagmanager.com/gtm.js?id=${containerId}`, "gtm-script-direct");
  }
};

const canInitialize = () => Boolean(consentGranted && isAnalyticsAvailable(settings));

const trackPageViewNow = (path: string, title?: string) => {
  if (!settings) {
    return;
  }

  if (settings.gaMeasurementId && window.gtag) {
    window.gtag("event", "page_view", {
      page_location: window.location.href,
      page_path: path,
      page_title: title ?? document.title,
    });
  }
};

const flushPendingPageView = () => {
  if (!pendingPageView || !initialized || !canInitialize()) {
    return;
  }

  const nextPageView = pendingPageView;
  pendingPageView = null;
  trackPageViewNow(nextPageView.path, nextPageView.title);
};

export const analyticsClient = {
  /**
   * Кто сейчас в магазине. Вызывается при входе и при выходе (тогда с null).
   *
   * Сбрасывать при выходе обязательно: иначе следующий гость на том же компьютере
   * продолжил бы считаться предыдущим покупателем.
   */
  setUserId(nextUserId: string | null) {
    if (userId === nextUserId) {
      return;
    }
    userId = nextUserId;

    const measurementId = settings?.gaMeasurementId;
    if (!measurementId || !window.gtag || !isAnalyticsAvailable(settings)) {
      return;
    }
    window.gtag("config", measurementId, {
      send_page_view: false,
      anonymize_ip: true,
      user_id: nextUserId ?? undefined,
    });
  },

  /**
   * Идентификатор посетителя в GA (значение куки _ga).
   *
   * Нужен серверу: покупку он отправляет сам, а куки принадлежат домену Google и с сервера
   * не читаются. Без этого значения GA засчитает покупку как визит ниоткуда — выручка будет
   * видна, а откуда пришёл покупатель, нет.
   *
   * Возвращает null, когда счётчик не загружен: аналитика выключена или согласия не было.
   * gtag отдаёт значение через колбэк, поэтому обёрнуто в промис с коротким тайм-аутом —
   * оформление заказа не должно ждать счётчик.
   */
  getClientId(): Promise<string | null> {
    const measurementId = settings?.gaMeasurementId;
    const gtag = window.gtag;
    if (!measurementId || !gtag || !isAnalyticsAvailable(settings)) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve(null), 500);
      try {
        gtag("get", measurementId, "client_id", (value: string) => {
          window.clearTimeout(timer);
          resolve(value || null);
        });
      } catch {
        window.clearTimeout(timer);
        resolve(null);
      }
    });
  },

  configure(nextSettings: AnalyticsPublicSettings | null) {
    settings = nextSettings;
    if (!isAnalyticsAvailable(settings)) {
      pendingPageView = null;
      return;
    }

    if (consentGranted) {
      void this.initialize();
    }
  },

  setConsent(granted: boolean) {
    consentGranted = granted;

    if (!granted) {
      pendingPageView = null;
      return;
    }

    if (isAnalyticsAvailable(settings)) {
      void this.initialize();
    }
  },

  async initialize() {
    if (initialized || initializingPromise || !settings || !canInitialize()) {
      return;
    }

    initializingPromise = (async () => {
      if (settings?.gaMeasurementId) {
        await initGa(settings.gaMeasurementId);
      }
      if (settings?.gtmContainerId) {
        await initGtm(settings.gtmContainerId);
      }

      initialized = true;
      flushPendingPageView();
    })();

    try {
      await initializingPromise;
    } finally {
      initializingPromise = null;
    }
  },

  trackPageView(path: string, title?: string) {
    if (!initialized) {
      // Первый просмотр случается раньше всего остального: настройки счётчика едут с
      // сервера, а согласие человек даёт кликом — на момент открытия страницы нет ни
      // того, ни другого. Раньше такой просмотр отбрасывался, и визит, в котором никуда
      // не перешли, не попадал в статистику вовсе: событий ноль, сессии для GA нет.
      // Запоминаем его и отправляем, когда счётчик поднимется; если согласия не будет,
      // setConsent(false) и configure(null) очистят очередь и никуда ничего не уйдёт.
      pendingPageView = { path, title };

      if (consentGranted && isAnalyticsAvailable(settings)) {
        void this.initialize();
      }
      return;
    }

    if (!consentGranted || !isAnalyticsAvailable(settings)) {
      return;
    }

    trackPageViewNow(path, title);
  },

  trackEvent(name: string, params: EventPayload = {}) {
    if (!canInitialize() || !initialized || !settings) {
      return;
    }

    if (settings.gaMeasurementId && window.gtag) {
      window.gtag("event", name, params);
    }
  },

  trackEcommerce(eventName: string, payload: EcommercePayload) {
    if (!canInitialize() || !initialized || !settings) {
      return;
    }

    if (settings.gaMeasurementId && window.gtag) {
      window.gtag("event", eventName, payload);
    }
  },

  resetForTests() {
    settings = null;
    consentGranted = false;
    initialized = false;
    initializingPromise = null;
    pendingPageView = null;
  },
};
