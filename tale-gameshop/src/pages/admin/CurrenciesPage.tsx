import React, { useCallback, useEffect, useState } from "react";
import PageHeader from "../../components/layout/PageHeader";
import Card from "../../components/ui/Card";
import { useToast } from "../../components/ui/ToastProvider";
import { useAdminHeader } from "../../components/layout/AdminHeaderContext";
import {
  getFxHistory,
  getFxOverview,
  importFxRatesNow,
  offerFxRates,
  type FxHistoryPoint,
  type FxOverview,
} from "../../api/adminFxApi";
import { formatMoney } from "../../utils/format-money";
import "./currencies-page.css";

/**
 * Валюты и курсы. Раньше AdminFxRatesController существовал, но фронт его не вызывал ни разу —
 * курсы жили только в конфиге и в базе, и по какому курсу сегодня продаётся, узнать из панели
 * было нельзя. Здесь: текущие курсы с возрастом, что получает покупатель за 10 единиц базовой
 * валюты (курс → наценка → округление), ручной ввод с гардом на скачок и история по паре.
 *
 * Базовая валюта, список валют, наценка и округление — только чтение: они меняются в конфиге
 * (Storefront:*), и включать валюту без заполненных прайс-листов из панели не надо.
 */

const ago = (value: string | null): string => {
  if (!value) {
    return "no rate";
  }
  const ms = Date.now() - new Date(value).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) {
    return `${Math.max(1, Math.floor(ms / 60_000))} min ago`;
  }
  if (h < 48) {
    return `${h} h ago`;
  }
  return `${Math.floor(h / 24)} d ago`;
};

const CurrenciesPage: React.FC = () => {
  const { setHeaderActions, setPageTitle } = useAdminHeader();
  const { addToast } = useToast();
  const [data, setData] = useState<FxOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<FxHistoryPoint[]>([]);
  // После отказа гарда предлагаем повторить с force — но только для той же валюты и того же значения.
  const [rejected, setRejected] = useState<Record<string, { rate: number; reason: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getFxOverview());
    } catch (err) {
      console.error("FX overview failed", err);
      addToast("Failed to load currencies.", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  const importNow = useCallback(async () => {
    setBusy(true);
    try {
      const result = await importFxRatesNow();
      addToast(result.message, result.updated.length > 0 ? "success" : "error");
      await load();
    } finally {
      setBusy(false);
    }
  }, [addToast, load]);

  useEffect(() => {
    setPageTitle("Currencies & FX");
    setHeaderActions([
      { type: "button", id: "fx-import", label: "Import now", variant: "primary", onClick: importNow },
      { type: "button", id: "fx-refresh", label: "Refresh", variant: "outline", onClick: load },
    ]);
    return () => setHeaderActions([]);
  }, [importNow, load, setHeaderActions, setPageTitle]);

  const submit = async (currency: string, force = false) => {
    const raw = drafts[currency];
    const value = Number(raw);
    if (!raw || !Number.isFinite(value) || value <= 0) {
      addToast("Enter a positive rate.", "error");
      return;
    }
    setBusy(true);
    try {
      const [result] = await offerFxRates({ [currency]: value }, force);
      if (result?.accepted) {
        addToast(`${currency}: rate ${result.rate} applied${result.changePercent ? ` (${result.changePercent > 0 ? "+" : ""}${result.changePercent}%)` : ""}.`, "success");
        setDrafts((prev) => ({ ...prev, [currency]: "" }));
        setRejected((prev) => {
          const next = { ...prev };
          delete next[currency];
          return next;
        });
        await load();
      } else {
        // Не тост: причина отказа должна остаться на экране вместе с кнопкой «всё равно применить».
        setRejected((prev) => ({ ...prev, [currency]: { rate: value, reason: result?.reason ?? "Rejected." } }));
      }
    } catch (err) {
      console.error("Offer FX rate failed", err);
      addToast("Failed to submit the rate.", "error");
    } finally {
      setBusy(false);
    }
  };

  const openHistory = async (currency: string) => {
    setHistoryFor(currency);
    try {
      setHistory(await getFxHistory(currency));
    } catch (err) {
      console.error("FX history failed", err);
      setHistory([]);
    }
  };

  return (
    <div className="admin-grid fx">
      <PageHeader
        title="Currencies & FX"
        description="What the storefront sells in today, at which rate, and what the customer actually pays."
        breadcrumbs={["Orders & Payments", "Currencies"]}
      />

      {data && (
        <Card>
          <div className="fx__facts">
            <div><span className="fx__fact-label">Base currency</span><span className="fx__fact-value">{data.baseCurrency}</span></div>
            <div><span className="fx__fact-label">Sold in</span><span className="fx__fact-value">{data.supportedCurrencies.join(", ")}</span></div>
            <div><span className="fx__fact-label">Markup on rate</span><span className="fx__fact-value">{data.markupPercent}%</span></div>
            <div><span className="fx__fact-label">Change guard</span><span className="fx__fact-value">±{data.maxChangePercent}%</span></div>
            <div>
              <span className="fx__fact-label">Auto import</span>
              <span className="fx__fact-value">{data.source.configured ? "configured" : "off"}</span>
              {data.source.configured && data.source.url && <span className="fx__fact-sub" title={data.source.url}>{data.source.url}</span>}
            </div>
          </div>
          <p className="fx__muted">
            These come from configuration (Storefront:*). Enable a currency only after its price lists are filled — otherwise checkout
            refuses the first cart. Prices are computed as rate → +markup → rounding rule.
          </p>
        </Card>
      )}

      <Card>
        <h3>Rates</h3>
        {loading && !data ? (
          <p className="fx__muted">Loading…</p>
        ) : data && data.rates.length === 0 ? (
          <p className="fx__muted">Only the base currency is enabled — nothing to convert.</p>
        ) : data ? (
          <div className="fx__table-wrap">
            <table className="admin-table fx__table">
              <thead>
                <tr>
                  <th>Currency</th>
                  <th>1 {data.baseCurrency} =</th>
                  <th>Updated</th>
                  <th title="What the customer pays for something priced 10 in the base currency">10 {data.baseCurrency} sells for</th>
                  <th>Rounding</th>
                  <th>New rate</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.rates.map((row) => {
                  const stale = row.capturedAt ? Date.now() - new Date(row.capturedAt).getTime() > 24 * 3_600_000 : true;
                  const reject = rejected[row.currency];
                  return (
                    <React.Fragment key={row.currency}>
                      <tr>
                        <td><strong>{row.currency}</strong>{row.manualOverride != null && <span className="fx__pill" title="Manual rate from configuration">manual</span>}</td>
                        <td className="fx__num">{row.rate ?? "—"}</td>
                        <td className={stale ? "fx__stale" : ""} title={row.capturedAt ?? undefined}>{ago(row.capturedAt)}</td>
                        <td className="fx__num">{row.samplePriceFor10 != null ? formatMoney(row.samplePriceFor10, row.currency) : "—"}</td>
                        <td>{row.rounding}</td>
                        <td>
                          <input
                            className="w-full p-1 border rounded fx__input"
                            type="number"
                            step="any"
                            min={0}
                            placeholder={row.rate != null ? String(row.rate) : "rate"}
                            value={drafts[row.currency] ?? ""}
                            onChange={(e) => setDrafts((prev) => ({ ...prev, [row.currency]: e.target.value }))}
                          />
                        </td>
                        <td className="fx__actions">
                          <button className="btn btn-outline" disabled={busy || !drafts[row.currency]} onClick={() => submit(row.currency)}>Apply</button>
                          <button className="btn btn-outline" disabled={busy} onClick={() => openHistory(row.currency)}>History</button>
                        </td>
                      </tr>
                      {reject && (
                        <tr className="fx__reject">
                          <td colSpan={7}>
                            <span>{reject.reason}</span>
                            <button className="btn btn-outline fx__force" disabled={busy} onClick={() => submit(row.currency, true)}>
                              Apply {reject.rate} anyway
                            </button>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {historyFor && (
        <Card>
          <div className="fx__history-head">
            <h3>{data?.baseCurrency} → {historyFor}: history</h3>
            <button className="btn btn-outline" onClick={() => setHistoryFor(null)}>Close</button>
          </div>
          {history.length === 0 ? (
            <p className="fx__muted">No history for this pair yet.</p>
          ) : (
            <ul className="fx__history">
              {history.map((h) => (
                <li key={h.capturedAt}>
                  <span className="fx__num">{h.rate}</span>
                  <span className="fx__muted">{new Date(h.capturedAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
};

export default CurrenciesPage;
