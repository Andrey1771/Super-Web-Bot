import React, { useEffect, useState } from "react";
import PageHeader from "../../components/layout/PageHeader";
import Card from "../../components/ui/Card";
import { useAdminHeader } from "../../components/layout/AdminHeaderContext";
import { useToast } from "../../components/ui/ToastProvider";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IApiClient } from "../../iterfaces/i-api-client";
import type { Settings } from "../../models/settings";
import { DEFAULT_SUPPORT_EMAIL, invalidateSiteSettings } from "../../hooks/use-site-settings";

const SettingsPage: React.FC = () => {
  const { setHeaderActions, setPageTitle } = useAdminHeader();
  const { addToast } = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [supportEmail, setSupportEmail] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    setPageTitle("Settings");
    setHeaderActions([]);
  }, [setHeaderActions, setPageTitle]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
        const response = await apiClient.api.get("/api/Settings");
        const current = (response.data as Settings[])[0] ?? null;
        setSettings(current);
        setSupportEmail(current?.supportEmail ?? "");
      } catch (error) {
        console.error(error);
        addToast("Failed to load settings.", "error");
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, [addToast]);

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const handleSave = async () => {
    if (!settings) {
      addToast("Settings are not loaded yet.", "error");
      return;
    }
    const trimmed = supportEmail.trim();
    if (trimmed && !isValidEmail(trimmed)) {
      addToast("Enter a valid email address.", "error");
      return;
    }
    setIsSaving(true);
    try {
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      // PUT принимает полный объект настроек — отправляем существующие поля без изменений.
      await apiClient.api.put("/api/Settings", { ...settings, supportEmail: trimmed || null });
      setSettings((prev) => (prev ? { ...prev, supportEmail: trimmed } : prev));
      invalidateSiteSettings();
      addToast("Settings saved.", "success");
    } catch (error) {
      console.error(error);
      addToast("Failed to save settings.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="admin-grid">
      <PageHeader
        title="Settings"
        description="Manage admin preferences and system configuration."
        breadcrumbs={["System", "Settings"]}
      />

      <Card>
        <h3>Contacts</h3>
        <p className="text-sm text-gray-500">
          Почта поддержки: используется на сайте везде, где нужен контакт (например, карточка
          «Email support» на странице Support).
        </p>
        {isLoading ? (
          <div className="skeleton h-10" style={{ maxWidth: 420 }} />
        ) : (
          <>
            <label className="text-sm font-semibold" htmlFor="settings-support-email">
              Support email
            </label>
            <input
              id="settings-support-email"
              type="email"
              className="input"
              style={{ maxWidth: 420 }}
              placeholder={DEFAULT_SUPPORT_EMAIL}
              value={supportEmail}
              onChange={(event) => setSupportEmail(event.target.value)}
              disabled={isSaving}
            />
            <p className="text-sm text-gray-500" style={{ marginTop: 6 }}>
              Пусто — используется адрес по умолчанию ({DEFAULT_SUPPORT_EMAIL}).
            </p>
            <div className="flex justify-end" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={isSaving || isLoading}>
                {isSaving ? "Saving..." : "Save settings"}
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default SettingsPage;
