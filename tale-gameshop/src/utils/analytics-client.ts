import type { AnalyticsPublicSettings } from "../types/analytics";
import { shouldLoadAnalytics } from "./analytics-consent";

type EcommerceItem = {
  item_id: string;
  item_name: string;
  price?: number;
  item_category?: string;
  quantity?: number;
};

type EcommercePayload = {
  currency?: string;
  value?: number;
  items: EcommerceItem[];
  transaction_id?: string;
};

type EventPayload = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (...args: any[]) => void;
    ym?: (...args: any[]) => void;
  }
}

let settings: AnalyticsPublicSettings | null = null;
let initialized = false;

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

const initGa = async (measurementId: string) => {
  await loadScript(`https://www.googletagmanager.com/gtag/js?id=${measurementId}`, "ga4-script");
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: any[]) {
    window.dataLayer?.push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    send_page_view: false,
    anonymize_ip: true,
  });
};

const initGtm = async (containerId: string) => {
  window.dataLayer = window.dataLayer || [];
  await loadScript(`https://www.googletagmanager.com/gtm.js?id=${containerId}`, "gtm-script");
};

const initYandex = async (counterId: string) => {
  await loadScript("https://mc.yandex.ru/metrika/tag.js", "ym-script");
  window.ym?.(Number(counterId), "init", {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: true,
  });
};

const canTrack = () => !!settings && settings.isEnabled && shouldLoadAnalytics();

export const analyticsClient = {
  configure(nextSettings: AnalyticsPublicSettings | null) {
    settings = nextSettings;
    if (settings && canTrack()) {
      this.initialize();
    }
  },

  async initialize() {
    if (initialized || !settings || !canTrack()) {
      return;
    }

    if (settings.gaMeasurementId) {
      await initGa(settings.gaMeasurementId);
    }
    if (settings.gtmContainerId) {
      await initGtm(settings.gtmContainerId);
    }
    if (settings.yandexCounterId) {
      await initYandex(settings.yandexCounterId);
    }
    initialized = true;
  },

  trackPageView(path: string, title?: string) {
    if (!canTrack() || !settings) {
      return;
    }

    if (settings.gaMeasurementId && window.gtag) {
      window.gtag("event", "page_view", {
        page_location: window.location.href,
        page_path: path,
        page_title: title ?? document.title,
      });
    }

    if (settings.yandexCounterId && window.ym) {
      window.ym(Number(settings.yandexCounterId), "hit", path, { title: title ?? document.title });
    }
  },

  trackEvent(name: string, params: EventPayload = {}) {
    if (!canTrack() || !settings) {
      return;
    }

    if (settings.gaMeasurementId && window.gtag) {
      window.gtag("event", name, params);
    }

    if (settings.yandexCounterId && window.ym) {
      const goalName = name.toUpperCase();
      window.ym(Number(settings.yandexCounterId), "reachGoal", goalName, params);
    }
  },

  trackEcommerce(eventName: string, payload: EcommercePayload) {
    if (!canTrack() || !settings) {
      return;
    }

    if (settings.gaMeasurementId && window.gtag) {
      window.gtag("event", eventName, payload);
    }

    if (settings.yandexCounterId && window.ym) {
      const goalName = eventName.toUpperCase();
      window.ym(Number(settings.yandexCounterId), "reachGoal", goalName, {
        value: payload.value,
        orderId: payload.transaction_id,
        items: payload.items?.map((item) => ({
          itemId: item.item_id,
          price: item.price,
          quantity: item.quantity,
        })),
      });
    }
  },
};
