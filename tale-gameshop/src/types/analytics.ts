export type AnalyticsProvider = "ga4" | "yandex";

export type AnalyticsSettings = {
  gaMeasurementId?: string;
  gaPropertyId?: string;
  gtmContainerId?: string;
  yandexCounterId?: string;
  isEnabled: boolean;
};

export type AnalyticsPublicSettings = {
  gaMeasurementId?: string;
  gtmContainerId?: string;
  yandexCounterId?: string;
  isEnabled: boolean;
};

export type AnalyticsOverview = {
  totals: {
    users: number;
    sessions: number;
    pageviews: number;
    purchases: number;
    revenue: number;
  };
  timeseries: Array<{ date: string; users: number; sessions: number; pageviews: number }>;
  topPages: Array<{ name: string; value: number }>;
  topItems: Array<{ name: string; value: number }>;
};

export type AnalyticsConnectionStatus = {
  ga4: "connected" | "not_configured" | "error";
  yandex: "connected" | "not_configured" | "error";
};
