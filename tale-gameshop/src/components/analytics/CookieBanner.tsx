import React, { useEffect, useState } from "react";
import {
  ANALYTICS_CONSENT_EVENT,
  emitAnalyticsConsentChange,
  getAnalyticsConsent,
  setAnalyticsConsent,
} from "../../utils/analytics-consent";
import { analyticsClient } from "../../utils/analytics-client";
import "./cookie-banner.css";

const CookieBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState<boolean>(false);

  useEffect(() => {
    const consent = getAnalyticsConsent();
    if (consent.analytics === null) {
      setVisible(true);
      return;
    }
    setAnalyticsEnabled(consent.analytics);
  }, []);

  const handleAccept = () => {
    setAnalyticsConsent(true);
    setAnalyticsEnabled(true);
    emitAnalyticsConsentChange();
    void analyticsClient.initialize().then(() => {
      analyticsClient.trackPageView(window.location.pathname + window.location.search, document.title);
    });
    setVisible(false);
  };

  const handleReject = () => {
    setAnalyticsConsent(false);
    setAnalyticsEnabled(false);
    emitAnalyticsConsentChange();
    setVisible(false);
  };

  const handleSaveSettings = () => {
    setAnalyticsConsent(analyticsEnabled);
    emitAnalyticsConsentChange();
    if (analyticsEnabled) {
      void analyticsClient.initialize().then(() => {
        analyticsClient.trackPageView(window.location.pathname + window.location.search, document.title);
      });
    }
    setVisible(false);
  };

  if (!visible) {
    return null;
  }

  return (
    <div className="cookie-banner">
      <div className="cookie-banner__content">
        <div>
          <h4>Cookies & Analytics</h4>
          <p className="muted">
            We use analytics cookies to understand browsing behavior and improve Tale Shop.
            You can enable or disable analytics tracking at any time.
          </p>
        </div>
        <div className="cookie-banner__actions">
          <button className="btn btn-outline" onClick={handleReject} type="button">
            Reject
          </button>
          <button className="btn btn-primary" onClick={handleAccept} type="button">
            Accept analytics
          </button>
          <button className="btn btn-ghost" onClick={() => setShowSettings((prev) => !prev)} type="button">
            Settings
          </button>
        </div>
      </div>
      {showSettings && (
        <div className="cookie-banner__settings">
          <label className="cookie-banner__toggle">
            <input
              type="checkbox"
              checked={analyticsEnabled}
              onChange={(event) => setAnalyticsEnabled(event.target.checked)}
            />
            <span>Analytics cookies</span>
          </label>
          <button className="btn btn-primary" onClick={handleSaveSettings} type="button">
            Save preferences
          </button>
        </div>
      )}
    </div>
  );
};

export default CookieBanner;
