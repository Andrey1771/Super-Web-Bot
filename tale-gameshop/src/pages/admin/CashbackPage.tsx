import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../../components/layout/PageHeader";
import Card from "../../components/ui/Card";
import { useAdminHeader } from "../../components/layout/AdminHeaderContext";
import { useToast } from "../../components/ui/ToastProvider";
import CashbackTiersEditor from "../../components/admin/CashbackTiersEditor";
import {
  getCashbackOverview,
  getCashbackSettings,
  saveCashbackSettings,
  type CashbackOverview,
  type CashbackSettingsPatch,
  type CashbackSettingsView,
} from "../../api/adminCashbackApi";
import { formatMoney } from "../../utils/format-money";
import "./settings-page.css";
import "./cashback-page.css";

/**
 * Кэшбэк — отдельная вкладка: сколько магазин должен покупателям, настройки программы и письма.
 * Настройки хранятся в том же документе, что и Site settings, но сохраняются только отсюда: сохранение одной
 * страницы не сбрасывает другую. Как и там, у каждого поля видно значение из конфига и есть «↺».
 */

type Draft = CashbackSettingsPatch;
type Key = Exclude<keyof Draft, "tiers">;

const draftFrom = (view: CashbackSettingsView): Draft => ({
  enabled: view.enabled.overridden ? view.enabled.value : null,
  pendingDays: view.pendingDays.overridden ? view.pendingDays.value : null,
  expiryMonths: view.expiryMonths.overridden ? view.expiryMonths.value : null,
  minCardPaymentUsd: view.minCardPaymentUsd.overridden ? view.minCardPaymentUsd.value : null,
  emailNotices: view.emailNotices.overridden ? view.emailNotices.value : null,
  expiryReminderDays: view.expiryReminderDays.overridden ? view.expiryReminderDays.value : null,
  tiers: view.tiers.overridden ? view.tiers.value : null,
});

const usd = (value: number) => formatMoney(value, "USD");

/**
 * Поля вынесены из компонента страницы: объявленный внутри рендера компонент — новый тип на каждый рендер,
 * инпут размонтируется и теряет фокус после каждого символа.
 */
type FieldCtx = {
  view: CashbackSettingsView;
  draft: Draft;
  set: (key: Key, value: Draft[Key]) => void;
};

const NumberField: React.FC<FieldCtx & { label: string; keyName: Key; unit?: string; min?: number; max?: number; step?: number; hint?: string }> = ({ view, draft, set, label, keyName, unit, min, max, step, hint }) => {
  const field = view[keyName];
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
          max={max}
          step={step ?? 1}
          placeholder={field.defaultValue == null ? "" : String(field.defaultValue)}
          value={overridden ? String(raw) : ""}
          onChange={(e) => set(keyName, e.target.value === "" ? null : Number(e.target.value))}
        />
        {unit && <span className="site-settings__unit">{unit}</span>}
        {overridden && (
          <button type="button" className="site-settings__reset" title="Back to configuration value" onClick={() => set(keyName, null)}>↺</button>
        )}
      </span>
      {hint && <span className="site-settings__hint">{hint}</span>}
    </label>
  );
};

const BoolField: React.FC<FieldCtx & { label: string; keyName: Key; hint?: string }> = ({ view, draft, set, label, keyName, hint }) => {
  const field = view[keyName];
  const raw = draft[keyName];
  const overridden = raw !== null && raw !== undefined;
  const effective = overridden ? Boolean(raw) : Boolean(field.value);
  return (
    <label className={`site-settings__field site-settings__field--row${overridden ? " site-settings__field--overridden" : ""}`}>
      <input type="checkbox" checked={effective} onChange={(e) => set(keyName, e.target.checked)} />
      <span className="site-settings__label">
        {label}
        {overridden ? <span className="site-settings__pill">custom</span> : <span className="site-settings__pill site-settings__pill--muted">config: {String(field.defaultValue)}</span>}
      </span>
      {overridden && (
        <button type="button" className="site-settings__reset" title="Back to configuration value" onClick={() => set(keyName, null)}>↺</button>
      )}
      {hint && <span className="site-settings__hint site-settings__hint--block">{hint}</span>}
    </label>
  );
};

const CashbackPage: React.FC = () => {
  const { setPageTitle } = useAdminHeader();
  const { addToast } = useToast();
  const [view, setView] = useState<CashbackSettingsView | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [overview, setOverview] = useState<CashbackOverview | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPageTitle("Cashback");
  }, [setPageTitle]);

  const load = useCallback(async () => {
    try {
      const [settings, totals] = await Promise.all([getCashbackSettings(), getCashbackOverview()]);
      setView(settings);
      setDraft(draftFrom(settings));
      setOverview(totals);
    } catch (error) {
      console.error(error);
      addToast("Failed to load cashback settings.", "error");
    }
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key: Key, value: Draft[Key]) => setDraft((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const result = await saveCashbackSettings(draft);
      addToast(result.message, result.ok ? "success" : "error");
      if (result.ok) {
        await load();
      }
    } catch (error) {
      console.error(error);
      addToast("Failed to save cashback settings.", "error");
    } finally {
      setSaving(false);
    }
  };

  const live = view ? draft.enabled ?? view.enabled.value : false;
  const emailsOn = view ? draft.emailNotices ?? view.emailNotices.value : false;

  return (
    <div className="admin-grid site-settings cashback-admin">
      <PageHeader
        title="Cashback"
        description="Store credit on paid card orders of signed-in customers: what the shop owes, the programme terms and customer emails. Changes apply immediately."
        breadcrumbs={["Marketing", "Cashback"]}
      />

      <Card>
        <div className="cashback-admin__head">
          <h3>Owed to customers</h3>
          {view && <span className={`site-settings__status${live ? " is-live" : ""}`}>{live ? "Live" : "Off"}</span>}
        </div>
        {!overview ? (
          <div className="skeleton h-10" />
        ) : (
          <>
            <div className="cashback-admin__stats">
              <div className="cashback-admin__stat cashback-admin__stat--main">
                <span className="cashback-admin__value">{usd(overview.liabilityUsd)}</span>
                <span className="cashback-admin__label">total owed · available + pending</span>
              </div>
              <div className="cashback-admin__stat">
                <span className="cashback-admin__value">{usd(overview.availableUsd)}</span>
                <span className="cashback-admin__label">available to spend</span>
              </div>
              <div className="cashback-admin__stat">
                <span className="cashback-admin__value">{usd(overview.pendingUsd)}</span>
                <span className="cashback-admin__label">pending</span>
              </div>
              <div className="cashback-admin__stat">
                <span className="cashback-admin__value">{overview.customersWithBalance}</span>
                <span className="cashback-admin__label">customers with a balance</span>
              </div>
              <div className="cashback-admin__stat">
                <span className="cashback-admin__value">{usd(overview.earnedAllTimeUsd)}</span>
                <span className="cashback-admin__label">earned all time · {usd(overview.usedAllTimeUsd)} used</span>
              </div>
            </div>
            <p className="text-sm text-gray-500">
              A customer&rsquo;s balance, history and manual adjustments are in their card in <Link to="/admin/customers">Customers</Link>.
              Pending that has unlocked without new activity may still count as pending here until the customer&rsquo;s next cashback event.
            </p>
          </>
        )}
      </Card>

      {view && (
        <>
          <Card>
            <h3>Programme</h3>
            <p className="text-sm text-gray-500">
              Changes apply to new orders; cashback already earned keeps the terms it was earned under.
              Keep the public Rewards page and the cashback terms in line with what you set here.
            </p>
            <div className="site-settings__grid">
              <BoolField view={view} draft={draft} set={set} label="Programme switched on" keyName="enabled" hint="Off — nothing new is earned or spent, no emails go out; balances stay." />
              <NumberField view={view} draft={draft} set={set} label="Pending period" keyName="pendingDays" unit="days" min={0} max={365} hint="How long cashback waits after the keys are issued before it can be spent." />
              <NumberField view={view} draft={draft} set={set} label="Expires after" keyName="expiryMonths" unit="months" min={0} max={120} hint="0 — never expires." />
              <NumberField view={view} draft={draft} set={set} label="Minimum card payment" keyName="minCardPaymentUsd" unit="USD" min={0} step={0.1} hint="Cashback never covers this part of an order (Stripe minimum)." />
            </div>
          </Card>

          <Card>
            <h3>Levels</h3>
            <p className="text-sm text-gray-500">The percentage depends on the customer&rsquo;s total spend on eligible orders. The first level starts at 0; a higher level cannot give less.</p>
            <CashbackTiersEditor
              value={draft.tiers ?? view.tiers.value}
              defaults={view.tiers.value}
              overridden={Boolean(draft.tiers)}
              onChange={(next) => setDraft((prev) => ({ ...prev, tiers: next }))}
            />
          </Card>

          <Card>
            <h3>Customer emails</h3>
            <p className="text-sm text-gray-500">
              Sent once a day: when cashback finishes its pending period, and before an unspent part expires. Each email has its own
              unsubscribe link; who got what is shown in the customer&rsquo;s card.
            </p>
            <div className="site-settings__grid">
              <BoolField view={view} draft={draft} set={set} label="Send cashback emails" keyName="emailNotices" hint="“Your cashback is ready” and “Some cashback expires soon”." />
              {emailsOn && (
                <NumberField view={view} draft={draft} set={set} label="Expiry reminder" keyName="expiryReminderDays" unit="days before" min={0} max={180} hint="0 — no expiry reminder. The terms promise about 30 days." />
              )}
            </div>
          </Card>

          <div className="site-settings__footer">
            <span className="text-sm text-gray-500">
              {view.updatedAtUtc ? `Settings last saved ${new Date(view.updatedAtUtc).toLocaleString()} by ${view.updatedBy ?? "—"}` : "No overrides saved yet — everything comes from configuration."}
            </span>
            <div className="flex gap-2">
              <button className="btn btn-outline" onClick={() => setDraft(draftFrom(view))} disabled={saving}>Discard changes</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save & apply"}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CashbackPage;
