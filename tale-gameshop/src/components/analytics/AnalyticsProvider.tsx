import React, { useEffect } from "react";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IAnalyticsService } from "../../iterfaces/i-analytics-service";
import { analyticsClient } from "../../utils/analytics-client";
import { ANALYTICS_CONSENT_EVENT } from "../../utils/analytics-consent";

const AnalyticsProvider: React.FC = () => {
  useEffect(() => {
    const analyticsService = container.get<IAnalyticsService>(IDENTIFIERS.IAnalyticsService);
    let isMounted = true;

    const fetchSettings = async () => {
      try {
        const settings = await analyticsService.getPublicSettings();
        if (isMounted) {
          analyticsClient.configure(settings);
        }
      } catch (error) {
        console.error("Failed to load analytics settings", error);
      }
    };

    fetchSettings();

    const handleConsentChange = () => {
      analyticsClient.initialize();
    };

    window.addEventListener(ANALYTICS_CONSENT_EVENT, handleConsentChange);

    return () => {
      isMounted = false;
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, handleConsentChange);
    };
  }, []);

  return null;
};

export default AnalyticsProvider;
