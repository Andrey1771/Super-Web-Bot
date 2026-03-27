import React, { useEffect, useState } from "react";
import PageHeader from "../../../components/layout/PageHeader";
import Card from "../../../components/ui/Card";
import { useToast } from "../../../components/ui/ToastProvider";
import { useAdminHeader } from "../../../components/layout/AdminHeaderContext";
import container from "../../../inversify.config";
import IDENTIFIERS from "../../../constants/identifiers";
import type { IAdminAnalyticsService } from "../../../iterfaces/i-admin-analytics-service";
import type { AnalyticsConnectionStatus, AnalyticsSettings } from "../../../types/analytics";

const AnalyticsSettingsPage: React.FC = () => {
  const adminAnalyticsService = container.get<IAdminAnalyticsService>(IDENTIFIERS.IAdminAnalyticsService);
  const { addToast } = useToast();
  const { setHeaderActions, setPageTitle } = useAdminHeader();

  const [settings, setSettings] = useState<AnalyticsSettings>({
    gaMeasurementId: "",
    gaPropertyId: "",
    gtmContainerId: "",
    yandexCounterId: "",
    isEnabled: false,
  });
  const [status, setStatus] = useState<AnalyticsConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPageTitle("Analytics settings");
    setHeaderActions([]);
  }, [setHeaderActions, setPageTitle]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await adminAnalyticsService.getSettings();
        setSettings(response);
        const connectionStatus = await adminAnalyticsService.getConnectionStatus();
        setStatus(connectionStatus);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [adminAnalyticsService]);

  const handleSave = async () => {
    try {
      const response = await adminAnalyticsService.updateSettings(settings);
      setSettings(response);
      addToast("Analytics settings saved", "success");
    } catch (error) {
      console.error(error);
      addToast("Failed to save analytics settings", "error");
    }
  };

  const handleTest = async (provider: "ga4" | "yandex") => {
    try {
      const response = await adminAnalyticsService.testConnection(provider);
      addToast(`${provider.toUpperCase()} connection: ${response.status}`, response.status === "connected" ? "success" : "error");
      const refreshed = await adminAnalyticsService.getConnectionStatus();
      setStatus(refreshed);
    } catch (error) {
      console.error(error);
      addToast("Failed to test connection", "error");
    }
  };

  return (
    <div className="admin-grid">
      <PageHeader
        title="Analytics settings"
        description="Configure GA4, GTM, and Yandex Metrika to track storefront performance."
        breadcrumbs={["Analytics", "Settings"]}
      />

      <Card>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">Enable analytics</label>
          <input
            type="checkbox"
            checked={settings.isEnabled}
            onChange={(event) => setSettings((prev) => ({ ...prev, isEnabled: event.target.checked }))}
          />
        </div>
      </Card>

      <Card>
        <div className="admin-grid admin-grid--2">
          <div>
            <h3>Google Analytics 4</h3>
            <p className="muted text-sm">Measurement ID format: G-XXXXXXX</p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">Measurement ID</label>
              <input
                className="input w-full"
                value={settings.gaMeasurementId ?? ""}
                onChange={(event) => setSettings((prev) => ({ ...prev, gaMeasurementId: event.target.value }))}
              />
              <label className="block text-sm">Property ID</label>
              <input
                className="input w-full"
                value={settings.gaPropertyId ?? ""}
                onChange={(event) => setSettings((prev) => ({ ...prev, gaPropertyId: event.target.value }))}
              />
              <label className="block text-sm">GTM Container ID (optional)</label>
              <input
                className="input w-full"
                value={settings.gtmContainerId ?? ""}
                onChange={(event) => setSettings((prev) => ({ ...prev, gtmContainerId: event.target.value }))}
              />
              <div className="flex items-center gap-2">
                <span className={`text-xs ${status?.ga4 === "connected" ? "text-green-600" : "text-slate-500"}`}>
                  {status?.ga4 ?? "not_checked"}
                </span>
                <button className="btn btn-outline" onClick={() => handleTest("ga4")}>
                  Test connection
                </button>
              </div>
            </div>
          </div>

          <div>
            <h3>Yandex Metrika</h3>
            <p className="muted text-sm">Counter ID format: 12345678</p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">Counter ID</label>
              <input
                className="input w-full"
                value={settings.yandexCounterId ?? ""}
                onChange={(event) => setSettings((prev) => ({ ...prev, yandexCounterId: event.target.value }))}
              />
              <div className="flex items-center gap-2">
                <span className={`text-xs ${status?.yandex === "connected" ? "text-green-600" : "text-slate-500"}`}>
                  {status?.yandex ?? "not_checked"}
                </span>
                <button className="btn btn-outline" onClick={() => handleTest("yandex")}>
                  Test connection
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
            Save
          </button>
        </div>
      </Card>

      <Card>
        <h3>Connection notes</h3>
        <ul className="list-disc ml-5 mt-2 text-sm text-slate-600">
          <li>Google OAuth credentials and refresh tokens must be stored on the server (env vars).</li>
          <li>Yandex OAuth token must be stored on the server (env vars).</li>
          <li>For Yandex goals, create goals such as VIEW_ITEM, ADD_TO_CART, BEGIN_CHECKOUT, and PURCHASE in Metrika.</li>
        </ul>
      </Card>
    </div>
  );
};

export default AnalyticsSettingsPage;
