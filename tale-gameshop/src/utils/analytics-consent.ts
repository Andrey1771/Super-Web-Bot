const CONSENT_KEY = "analytics-consent";

type AnalyticsConsent = {
  analytics: boolean | null;
};

export const getAnalyticsConsent = (): AnalyticsConsent => {
  const stored = localStorage.getItem(CONSENT_KEY);
  if (!stored) {
    return { analytics: null };
  }
  try {
    const parsed = JSON.parse(stored) as AnalyticsConsent;
    return {
      analytics: typeof parsed.analytics === "boolean" ? parsed.analytics : null,
    };
  } catch (error) {
    console.error("Failed to parse analytics consent", error);
    return { analytics: null };
  }
};

export const setAnalyticsConsent = (value: boolean) => {
  localStorage.setItem(CONSENT_KEY, JSON.stringify({ analytics: value }));
};

export const shouldLoadAnalytics = (): boolean => {
  const consent = getAnalyticsConsent();
  return consent.analytics === true;
};

export const clearAnalyticsConsent = () => {
  localStorage.removeItem(CONSENT_KEY);
};

export const ANALYTICS_CONSENT_EVENT = "analytics-consent-changed";

export const emitAnalyticsConsentChange = () => {
  window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT));
};
