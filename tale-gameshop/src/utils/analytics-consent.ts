const CONSENT_KEY = "analytics-consent";

export type AnalyticsConsent = {
  analytics: boolean | null;
};

const DEFAULT_CONSENT: AnalyticsConsent = { analytics: null };

export const ANALYTICS_CONSENT_EVENT = "analytics-consent-changed";

export const getAnalyticsConsent = (): AnalyticsConsent => {
  const stored = localStorage.getItem(CONSENT_KEY);
  if (!stored) {
    return DEFAULT_CONSENT;
  }

  try {
    const parsed = JSON.parse(stored) as AnalyticsConsent;
    return {
      analytics: typeof parsed.analytics === "boolean" ? parsed.analytics : null,
    };
  } catch (error) {
    console.error("Failed to parse analytics consent", error);
    return DEFAULT_CONSENT;
  }
};

export const setAnalyticsConsent = (value: boolean) => {
  localStorage.setItem(CONSENT_KEY, JSON.stringify({ analytics: value }));
};

export const clearAnalyticsConsent = () => {
  localStorage.removeItem(CONSENT_KEY);
};

export const emitAnalyticsConsentChange = () => {
  window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT));
};

export const hasSavedAnalyticsConsent = (): boolean => getAnalyticsConsent().analytics !== null;
