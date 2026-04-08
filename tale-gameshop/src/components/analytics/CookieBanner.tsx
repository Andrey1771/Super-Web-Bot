import React, { useEffect, useState } from "react";
import { useAnalyticsConsent } from "./AnalyticsProvider";
import "./cookie-banner.css";

const CookieBanner: React.FC = () => {
  const { consent, shouldShowBanner, isSettingsOpen, setSettingsOpen, updateConsent } = useAnalyticsConsent();
  const [analyticsEnabled, setAnalyticsEnabled] = useState<boolean>(consent === true);

  useEffect(() => {
    setAnalyticsEnabled(consent === true);
  }, [consent]);

  const handleAccept = () => {
    updateConsent(true);
  };

  const handleReject = () => {
    updateConsent(false);
  };

  const handleSaveSettings = () => {
    updateConsent(analyticsEnabled);
  };

  if (!shouldShowBanner) {
    return null;
  }

  return (
    <div className="cookie-banner" role="dialog" aria-live="polite" aria-label="Cookie settings">
      <div className="cookie-banner__content">
        <div>
          <h4>Cookie preferences</h4>
          <p className="muted">
            We use essential cookies to keep the site secure and functional. Optional analytics cookies help us
            understand how people use the store so we can improve content and performance.
          </p>
        </div>
        <div className="cookie-banner__actions">
          <button className="btn btn-outline" onClick={handleReject} type="button">
            Reject
          </button>
          <button className="btn btn-primary" onClick={handleAccept} type="button">
            Accept analytics
          </button>
          <button className="btn btn-ghost" onClick={() => setSettingsOpen(!isSettingsOpen)} type="button">
            Settings
          </button>
        </div>
      </div>
      {isSettingsOpen && (
        <div className="cookie-banner__settings">
          <div>
            <div className="cookie-banner__section-title">Essential functionality</div>
            <p className="cookie-banner__section-note muted">Always on. Required for login, cart, and checkout.</p>
          </div>
          <div>
            <label className="cookie-banner__toggle">
              <input
                type="checkbox"
                checked={analyticsEnabled}
                onChange={(event) => setAnalyticsEnabled(event.target.checked)}
              />
              <span>Optional analytics cookies</span>
            </label>
            <p className="cookie-banner__section-note muted">Used only to measure usage and improve the storefront.</p>
          </div>
          <button className="btn btn-primary" onClick={handleSaveSettings} type="button">
            Save preferences
          </button>
        </div>
      )}
    </div>
  );
};

export default CookieBanner;
