import React, { useCallback, useEffect, useState } from "react";
import PageHeader from "../../components/layout/PageHeader";
import Card from "../../components/ui/Card";
import { useAdminHeader } from "../../components/layout/AdminHeaderContext";
import { useToast } from "../../components/ui/ToastProvider";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IApiClient } from "../../iterfaces/i-api-client";
import type { Settings } from "../../models/settings";
import { DEFAULT_SUPPORT_EMAIL, invalidateSiteSettings } from "../../hooks/use-site-settings";
import { getSiteSettings, saveSiteSettings, type SiteSettingsPatch, type SiteSettingsView } from "../../api/adminSiteSettingsApi";
import "./settings-page.css";

/**
 * Настройки сайта. Раньше здесь было одно поле — почта поддержки; всё остальное (часы
 * поддержки, бюджет LLM, наценка на курс, платёжные рельсы) жило в env и менялось деплоем.
 * Теперь эти значения — оверлей поверх конфига, хранятся в Mongo и применяются сразу:
 * у каждого поля видно действующее значение, значение из конфига и «переопределено ли», и
 * есть «↺» — вернуть к конфигу.
 */

type Draft = SiteSettingsPatch;

const draftFrom = (view: SiteSettingsView): Draft => ({
  businessHoursEnabled: view.support.businessHoursEnabled.overridden ? view.support.businessHoursEnabled.value : null,
  businessHoursTimeZone: view.support.businessHoursTimeZone.overridden ? view.support.businessHoursTimeZone.value : null,
  businessHoursStart: view.support.businessHoursStart.overridden ? view.support.businessHoursStart.value : null,
  businessHoursEnd: view.support.businessHoursEnd.overridden ? view.support.businessHoursEnd.value : null,
  expectedWaitMinutes: view.support.expectedWaitMinutes.overridden ? view.support.expectedWaitMinutes.value : null,
  specialistEmail: view.support.specialistEmail.overridden ? view.support.specialistEmail.value : null,
  llmDailyBudgetUsd: view.support.llmDailyBudgetUsd.overridden ? view.support.llmDailyBudgetUsd.value : null,
  notifyTelegramOnEscalation: view.support.notifyTelegramOnEscalation.overridden ? view.support.notifyTelegramOnEscalation.value : null,
  notifyEmailOnEscalation: view.support.notifyEmailOnEscalation.overridden ? view.support.notifyEmailOnEscalation.value : null,
  fxMarkupPercent: view.fx.markupPercent.overridden ? view.fx.markupPercent.value : null,
  fxMaxChangePercent: view.fx.maxChangePercent.overridden ? view.fx.maxChangePercent.value : null,
  cardEnabled: view.rails.card.enabled.overridden ? view.rails.card.enabled.value : null,
  cryptoEnabled: view.rails.crypto.enabled.overridden ? view.rails.crypto.enabled.value : null,
  starsEnabled: view.rails.stars.enabled.overridden ? view.rails.stars.enabled.value : null,
});

/**
 * Поля вынесены из компонента страницы: объявленный внутри рендера компонент — новый тип на
 * каждый рендер, инпут размонтируется и теряет фокус после каждого символа.
 */
type FieldCtx = {
  view: SiteSettingsView;
  draft: Draft;
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  reset: (key: keyof Draft) => void;
};

const NumberField: React.FC<FieldCtx & { label: string; keyName: keyof Draft; unit?: string; min?: number; step?: number; hint?: string }> = ({ view, draft, set, reset, label, keyName, unit, min, step, hint }) => {
  const field = lookup(view, keyName);
  const raw = draft[keyName];
  const overridden = raw !== null && raw !== undefined;
  return (
    <label className={`site-settings__field${overridden ? " site-settings__field--overridden" : ""}`}>
      <span className="site-settings__label">
        {label}
        {overridden ? <span className="site-settings__pill">custom</span> : <span className="site-settings__pill site-settings__pill--muted">config</span>}
      </span>
      <span className="site-settings__control">
        <input
          className="input"
          type="number"
          min={min}
          step={step ?? 1}
          placeholder={field.defaultValue == null ? "" : String(field.defaultValue)}
          value={overridden ? String(raw) : ""}
          onChange={(e) => set(keyName, (e.target.value === "" ? null : Number(e.target.value)) as never)}
        />
        {unit && <span className="site-settings__unit">{unit}</span>}
        {overridden && (
          <button type="button" className="site-settings__reset" title="Back to configuration value" onClick={() => reset(keyName)}>↺</button>
        )}
      </span>
      {hint && <span className="site-settings__hint">{hint}</span>}
    </label>
  );
};

const BoolField: React.FC<FieldCtx & { label: string; keyName: keyof Draft; hint?: string; disabled?: boolean }> = ({ view, draft, set, reset, label, keyName, hint, disabled }) => {
  const field = lookup(view, keyName);
  const raw = draft[keyName];
  const overridden = raw !== null && raw !== undefined;
  const effective = overridden ? Boolean(raw) : Boolean(field.value);
  return (
    <label className={`site-settings__field site-settings__field--row${overridden ? " site-settings__field--overridden" : ""}`}>
      <input type="checkbox" checked={effective} disabled={disabled} onChange={(e) => set(keyName, e.target.checked as never)} />
      <span className="site-settings__label">
        {label}
        {overridden ? <span className="site-settings__pill">custom</span> : <span className="site-settings__pill site-settings__pill--muted">config: {String(field.defaultValue)}</span>}
      </span>
      {overridden && (
        <button type="button" className="site-settings__reset" title="Back to configuration value" onClick={() => reset(keyName)}>↺</button>
      )}
      {hint && <span className="site-settings__hint site-settings__hint--block">{hint}</span>}
    </label>
  );
};

const TextField: React.FC<FieldCtx & { label: string; keyName: keyof Draft; placeholder?: string; hint?: string }> = ({ view, draft, set, reset, label, keyName, placeholder, hint }) => {
  const field = lookup(view, keyName);
  const raw = draft[keyName];
  const overridden = raw !== null && raw !== undefined && String(raw) !== "";
  return (
    <label className={`site-settings__field${overridden ? " site-settings__field--overridden" : ""}`}>
      <span className="site-settings__label">
        {label}
        {overridden ? <span className="site-settings__pill">custom</span> : <span className="site-settings__pill site-settings__pill--muted">config</span>}
      </span>
      <span className="site-settings__control">
        <input
          className="input"
          type="text"
          placeholder={placeholder ?? (field.defaultValue == null ? "" : String(field.defaultValue))}
          value={overridden ? String(raw) : ""}
          onChange={(e) => set(keyName, (e.target.value === "" ? null : e.target.value) as never)}
        />
        {overridden && (
          <button type="button" className="site-settings__reset" title="Back to configuration value" onClick={() => reset(keyName)}>↺</button>
        )}
      </span>
      {hint && <span className="site-settings__hint">{hint}</span>}
    </label>
  );
};

const SettingsPage: React.FC = () => {
  const { setHeaderActions, setPageTitle } = useAdminHeader();
  const { addToast } = useToast();

  // --- контакты (старый эндпоинт /api/Settings) ---
  const [settings, setSettings] = useState<Settings | null>(null);
  const [supportEmail, setSupportEmail] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // --- оверлей настроек сайта ---
  const [view, setView] = useState<SiteSettingsView | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [savingOverlay, setSavingOverlay] = useState(false);

  useEffect(() => {
    setPageTitle("Site settings");
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

  const loadOverlay = useCallback(async () => {
    try {
      const data = await getSiteSettings();
      setView(data);
      setDraft(draftFrom(data));
    } catch (error) {
      console.error(error);
      addToast("Failed to load site settings.", "error");
    }
  }, [addToast]);

  useEffect(() => {
    loadOverlay();
  }, [loadOverlay]);

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const handleSaveContacts = async () => {
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
      await apiClient.api.put("/api/Settings", { ...settings, supportEmail: trimmed || null });
      setSettings((prev) => (prev ? { ...prev, supportEmail: trimmed } : prev));
      invalidateSiteSettings();
      addToast("Contacts saved.", "success");
    } catch (error) {
      console.error(error);
      addToast("Failed to save settings.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveOverlay = async () => {
    setSavingOverlay(true);
    try {
      const result = await saveSiteSettings(draft);
      addToast(result.message, result.ok ? "success" : "error");
      if (result.ok) {
        await loadOverlay();
      }
    } catch (error) {
      console.error(error);
      addToast("Failed to save site settings.", "error");
    } finally {
      setSavingOverlay(false);
    }
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((prev) => ({ ...prev, [key]: value }));
  const reset = (key: keyof Draft) => setDraft((prev) => ({ ...prev, [key]: null }));

  return (
    <div className="admin-grid site-settings">
      <PageHeader
        title="Site settings"
        description="Things the owner changes by hand — applied immediately, no redeploy. Empty means “as in configuration”."
        breadcrumbs={["System", "Site settings"]}
      />

      <Card>
        <h3>Contacts</h3>
        <p className="text-sm text-gray-500">Support e-mail shown on the site wherever a contact is needed (e.g. the “Email support” card).</p>
        {isLoading ? (
          <div className="skeleton h-10" style={{ maxWidth: 420 }} />
        ) : (
          <>
            <input
              type="email"
              className="input"
              style={{ maxWidth: 420 }}
              placeholder={DEFAULT_SUPPORT_EMAIL}
              value={supportEmail}
              onChange={(event) => setSupportEmail(event.target.value)}
              disabled={isSaving}
            />
            <div className="flex justify-end" style={{ marginTop: 12 }}>
              <button className="btn btn-outline" onClick={handleSaveContacts} disabled={isSaving || isLoading}>
                {isSaving ? "Saving..." : "Save contacts"}
              </button>
            </div>
          </>
        )}
      </Card>

      {view && (
        <>
          <Card>
            <h3>Support hours &amp; expectations</h3>
            <p className="text-sm text-gray-500">What the chat widget tells customers about when a human is around.</p>
            <div className="site-settings__grid">
              <BoolField view={view} draft={draft} set={set} reset={reset} label="Business hours enabled" keyName="businessHoursEnabled" hint="Off — the widget never says “outside working hours”." />
              <TextField view={view} draft={draft} set={set} reset={reset} label="Time zone" keyName="businessHoursTimeZone" placeholder="Europe/Moscow" hint="IANA (Europe/Moscow) or Windows name." />
              <NumberField view={view} draft={draft} set={set} reset={reset} label="Opens at" keyName="businessHoursStart" unit="h" min={0} />
              <NumberField view={view} draft={draft} set={set} reset={reset} label="Closes at" keyName="businessHoursEnd" unit="h" min={1} />
              <NumberField view={view} draft={draft} set={set} reset={reset} label="Expected wait" keyName="expectedWaitMinutes" unit="min" min={0} hint="Shown as “a specialist usually replies within N minutes”." />
            </div>
          </Card>

          <Card>
            <h3>Support alerts &amp; assistant</h3>
            <p className="text-sm text-gray-500">Where escalations go and how much the AI assistant may spend per day. Provider: <strong>{view.support.llmProvider}</strong> (set in configuration).</p>
            <div className="site-settings__grid">
              <TextField view={view} draft={draft} set={set} reset={reset} label="Specialist e-mail" keyName="specialistEmail" placeholder="support@…" hint="Escalation e-mails and stock alerts go here." />
              <NumberField view={view} draft={draft} set={set} reset={reset} label="Daily LLM budget" keyName="llmDailyBudgetUsd" unit="USD" min={0} step={0.5} hint="0 — no limit. When reached, the assistant answers from the knowledge base only." />
              <BoolField view={view} draft={draft} set={set} reset={reset} label="Telegram alert on escalation" keyName="notifyTelegramOnEscalation" />
              <BoolField view={view} draft={draft} set={set} reset={reset} label="E-mail alert on escalation" keyName="notifyEmailOnEscalation" />
            </div>
          </Card>

          <Card>
            <h3>Currency conversion</h3>
            <p className="text-sm text-gray-500">Applied on top of the imported rate. Rates themselves live in Currencies &amp; FX.</p>
            <div className="site-settings__grid">
              <NumberField view={view} draft={draft} set={set} reset={reset} label="Markup on rate" keyName="fxMarkupPercent" unit="%" min={0} step={0.1} hint="Covers rate movement between showing a price and settling it." />
              <NumberField view={view} draft={draft} set={set} reset={reset} label="Change guard" keyName="fxMaxChangePercent" unit="%" min={0.1} step={0.5} hint="A rate that moves more than this in one update is rejected until a human confirms." />
            </div>
          </Card>

          <Card>
            <h3>Payment rails</h3>
            <p className="text-sm text-gray-500">A rail is offered only when it is both configured (keys present) and switched on here.</p>
            <div className="site-settings__grid">
              <BoolField view={view} draft={draft} set={set} reset={reset} label={`Cards (Stripe) — ${view.rails.card.configured ? "configured" : "not configured"}`} keyName="cardEnabled" hint={view.rails.card.hint} disabled={!view.rails.card.configured} />
              <BoolField view={view} draft={draft} set={set} reset={reset} label={`Crypto (BTCPay) — ${view.rails.crypto.configured ? "configured" : "not configured"}`} keyName="cryptoEnabled" hint={view.rails.crypto.hint} disabled={!view.rails.crypto.configured} />
              <BoolField view={view} draft={draft} set={set} reset={reset} label={`Telegram Stars — ${view.rails.stars.configured ? "bot token set" : "no bot token"}`} keyName="starsEnabled" hint={view.rails.stars.hint} disabled />
            </div>
          </Card>

          <div className="site-settings__footer">
            <span className="text-sm text-gray-500">
              {view.updatedAtUtc ? `Last saved ${new Date(view.updatedAtUtc).toLocaleString()} by ${view.updatedBy ?? "—"}` : "No overrides saved yet — everything comes from configuration."}
            </span>
            <div className="flex gap-2">
              <button className="btn btn-outline" onClick={() => setDraft(draftFrom(view))} disabled={savingOverlay}>Discard changes</button>
              <button className="btn btn-primary" onClick={handleSaveOverlay} disabled={savingOverlay}>{savingOverlay ? "Saving…" : "Save & apply"}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/** Достаёт из view поле по ключу оверлея — они называются одинаково, но лежат по группам. */
function lookup(view: SiteSettingsView, key: keyof Draft): { value: unknown; defaultValue: unknown; overridden: boolean } {
  switch (key) {
    case "businessHoursEnabled": return view.support.businessHoursEnabled;
    case "businessHoursTimeZone": return view.support.businessHoursTimeZone;
    case "businessHoursStart": return view.support.businessHoursStart;
    case "businessHoursEnd": return view.support.businessHoursEnd;
    case "expectedWaitMinutes": return view.support.expectedWaitMinutes;
    case "specialistEmail": return view.support.specialistEmail;
    case "llmDailyBudgetUsd": return view.support.llmDailyBudgetUsd;
    case "notifyTelegramOnEscalation": return view.support.notifyTelegramOnEscalation;
    case "notifyEmailOnEscalation": return view.support.notifyEmailOnEscalation;
    case "fxMarkupPercent": return view.fx.markupPercent;
    case "fxMaxChangePercent": return view.fx.maxChangePercent;
    case "cardEnabled": return view.rails.card.enabled;
    case "cryptoEnabled": return view.rails.crypto.enabled;
    case "starsEnabled": return view.rails.stars.enabled;
    default: return { value: null, defaultValue: null, overridden: false };
  }
}

export default SettingsPage;
