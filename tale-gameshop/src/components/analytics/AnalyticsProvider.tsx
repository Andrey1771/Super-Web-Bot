import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IAnalyticsService } from "../../iterfaces/i-analytics-service";
import type { AnalyticsPublicSettings } from "../../types/analytics";
import { analyticsClient } from "../../utils/analytics-client";
import {
  ANALYTICS_CONSENT_EVENT,
  emitAnalyticsConsentChange,
  getAnalyticsConsent,
  setAnalyticsConsent,
} from "../../utils/analytics-consent";
import { isAnalyticsAvailable, shouldShowCookieBanner } from "../../utils/analytics-state";

type AnalyticsContextValue = {
  consent: boolean | null;
  settingsLoaded: boolean;
  analyticsAvailable: boolean;
  shouldShowBanner: boolean;
  isSettingsOpen: boolean;
  setSettingsOpen: (isOpen: boolean) => void;
  updateConsent: (value: boolean) => void;
};

const AnalyticsContext = createContext<AnalyticsContextValue>({
  consent: null,
  settingsLoaded: false,
  analyticsAvailable: false,
  shouldShowBanner: false,
  isSettingsOpen: false,
  setSettingsOpen: () => undefined,
  updateConsent: () => undefined,
});

type AnalyticsProviderProps = {
  children: React.ReactNode;
  isAdminRoute: boolean;
};

const AnalyticsProvider: React.FC<AnalyticsProviderProps> = ({ children, isAdminRoute }) => {
  const location = useLocation();
  const [settings, setSettings] = useState<AnalyticsPublicSettings | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [consent, setConsent] = useState<boolean | null>(() => getAnalyticsConsent().analytics);
  const [isSettingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const analyticsService = container.get<IAnalyticsService>(IDENTIFIERS.IAnalyticsService);
    let isMounted = true;

    const fetchSettings = async () => {
      try {
        const publicSettings = await analyticsService.getPublicSettings();
        if (!isMounted) {
          return;
        }

        setSettings(publicSettings);
        analyticsClient.configure(publicSettings);
      } catch (error) {
        console.error("Failed to load analytics settings", error);
        if (isMounted) {
          setSettings(null);
          analyticsClient.configure(null);
        }
      } finally {
        if (isMounted) {
          setSettingsLoaded(true);
        }
      }
    };

    fetchSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const nextConsent = consent === true;
    analyticsClient.setConsent(nextConsent);

    if (nextConsent) {
      void analyticsClient.initialize();
    }
  }, [consent]);

  useEffect(() => {
    if (isAdminRoute) {
      return;
    }

    analyticsClient.trackPageView(location.pathname + location.search, document.title);
  }, [isAdminRoute, location.pathname, location.search]);

  const updateConsent = (value: boolean) => {
    setAnalyticsConsent(value);
    setConsent(value);
    emitAnalyticsConsentChange();
    setSettingsOpen(false);
  };

  useEffect(() => {
    const onConsentChanged = () => {
      setConsent(getAnalyticsConsent().analytics);
    };

    window.addEventListener(ANALYTICS_CONSENT_EVENT, onConsentChanged);
    return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, onConsentChanged);
  }, []);

  const analyticsAvailable = isAnalyticsAvailable(settings);

  const shouldShowBanner = shouldShowCookieBanner(isAdminRoute, settingsLoaded, settings, consent) || isSettingsOpen;

  const value = useMemo<AnalyticsContextValue>(
    () => ({
      consent,
      settingsLoaded,
      analyticsAvailable,
      shouldShowBanner,
      isSettingsOpen,
      setSettingsOpen,
      updateConsent,
    }),
    [analyticsAvailable, consent, isSettingsOpen, settingsLoaded, shouldShowBanner],
  );

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
};

export const useAnalyticsConsent = () => useContext(AnalyticsContext);

export default AnalyticsProvider;
