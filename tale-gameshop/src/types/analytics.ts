export type AnalyticsProvider = "ga4";

export type AnalyticsSettings = {
  /** Задан ли секрет Measurement Protocol. Сам ключ сервер наружу не отдаёт. */
  hasGaApiSecret?: boolean;
  /** Начало и конец сохранённого секрета: опознать можно, прочитать нельзя. */
  gaApiSecretHint?: string | null;
  /** Новое значение секрета. Пусто — «не менять». */
  gaApiSecret?: string;
  gaMeasurementId?: string;
  gaPropertyId?: string;
  gtmContainerId?: string;

  /** Доступ на чтение отчётов. Логин не секрет и приходит целиком; два других — только маской. */
  gaOauthClientId?: string;
  gaOauthClientSecret?: string;
  hasGaOauthClientSecret?: boolean;
  gaOauthClientSecretHint?: string | null;
  gaOauthRefreshToken?: string;
  hasGaOauthRefreshToken?: boolean;
  gaOauthRefreshTokenHint?: string | null;

  isEnabled: boolean;
};

export type AnalyticsPublicSettings = {
  gaMeasurementId?: string;
  gtmContainerId?: string;
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
  ga4: "connected" | "not_configured" | "error" | "token_rejected";

  /** Слова самого Google, если отказ пришёл от него. Пусто — отказа не было. */
  ga4Detail?: string | null;

  /** Когда сохранён refresh token: по нему считается недельный срок статуса Testing. */
  refreshTokenSavedAtUtc?: string | null;

  /** Что сервер знает о доступе к чтению отчётов. Только названия полей, без значений. */
  reportAccess?: {
    configured: boolean;
    missing: string[];
  };
};
