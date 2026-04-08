import type { AnalyticsPublicSettings } from "../types/analytics";

export const hasAnyAnalyticsProvider = (settings: AnalyticsPublicSettings | null): boolean => {
  if (!settings) {
    return false;
  }

  return [settings.gaMeasurementId, settings.gtmContainerId, settings.yandexCounterId].some(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
};

export const isAnalyticsAvailable = (settings: AnalyticsPublicSettings | null): boolean => {
  if (!settings?.isEnabled) {
    return false;
  }

  return hasAnyAnalyticsProvider(settings);
};

export const shouldShowCookieBanner = (
  isAdminRoute: boolean,
  settingsLoaded: boolean,
  settings: AnalyticsPublicSettings | null,
  consent: boolean | null,
): boolean => {
  if (isAdminRoute || !settingsLoaded || !isAnalyticsAvailable(settings)) {
    return false;
  }

  return consent === null;
};
