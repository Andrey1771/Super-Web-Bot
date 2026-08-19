import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader, { GAMES_TABS } from "../../components/layout/PageHeader";
import Card from "../../components/ui/Card";
import { useToast } from "../../components/ui/ToastProvider";
import { useAdminHeader } from "../../components/layout/AdminHeaderContext";
import { getPriceMatrix, setPrice, type PriceCell, type PriceMatrix } from "../../api/adminPricesApi";
import { formatMoney } from "../../utils/format-money";
import "./prices-page.css";

/**
 * Прайс-лист: игра × валюта одной таблицей. В ячейке видно цену и откуда она — базовая, ручная,
 * по курсу или «не продаётся». Клик по ячейке — ручная цена; очистить — вернуться к курсу.
 * Раньше цены по валютам правились только в форме игры, по одной, и общей картины не было.
 */

const SOURCE_LABEL: Record<PriceCell["source"], string> = {
  base: "base",
  manual: "manual",
  rate: "by rate",
  none: "not sold",
};

type Editing = { gameId: string; currency: string; value: string } | null;

const PricesPage: React.FC = () => {
  const { setHeaderActions, setPageTitle } = useAdminHeader();
  const { addToast } = useToast();
  const [data, setData] = useState<PriceMatrix | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Editing>(null);
  const [saving, setSaving] = useState(false);
  const [onlyManual, setOnlyManual] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getPriceMatrix());
    } catch (err) {
      console.error("Price matrix failed", err);
      addToast("Failed to load prices.", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPageTitle("Prices");
    setHeaderActions([{ type: "button", id: "prices-refresh", label: "Refresh", variant: "outline", onClick: load }]);
    return () => setHeaderActions([]);
  }, [load, setHeaderActions, setPageTitle]);

  const rows = useMemo(() => {
    if (!data) {
      return [];
    }
    const needle = query.trim().toLowerCase();
    return data.games.filter((g) => {
      if (needle && !g.title.toLowerCase().includes(needle)) {
        return false;
      }
      if (onlyManual && !Object.values(g.cells).some((c) => c.source === "manual")) {
        return false;
      }
      return true;
    });
  }, [data, onlyManual, query]);

  const commit = async () => {
    if (!editing || !data) {
      return;
    }
    const raw = editing.value.trim();
    const value = raw === "" ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      addToast("Enter a non-negative number, or leave empty to use the rate.", "error");
      return;
    }
    setSaving(true);
    try {
      const result = await setPrice(editing.gameId, editing.currency, value);
      setData((prev) =>
        prev
          ? {
              ...prev,
              games: prev.games.map((g) =>
                g.gameId === editing.gameId
                  ? {
                      ...g,
                      basePrice: editing.currency === g.baseCurrency && value !== null ? value : g.basePrice,
                      cells: { ...g.cells, [editing.currency]: result.cell },
                    }
                  : g
              ),
            }
          : prev
      );
      setEditing(null);
    } catch (err: any) {
      console.error("Set price failed", err);
      addToast(err?.response?.data?.message ?? "Could not save the price.", "error");
    } finally {
      setSaving(false);
    }
  };

  const summary = useMemo(() => {
    if (!data) {
      return null;
    }
    const total = data.games.length;
    const perCurrency = data.currencies.map((c) => {
      const sold = data.games.filter((g) => g.cells[c]?.price != null).length;
      const manual = data.games.filter((g) => g.cells[c]?.source === "manual").length;
      return { currency: c, sold, manual, missing: total - sold };
    });
    return { total, perCurrency };
  }, [data]);

  return (
    <div className="admin-grid prices">
      <PageHeader
        title="Prices"
        description="Every game in every storefront currency. Click a cell to set a manual price; clear it to fall back to the rate."
        breadcrumbs={["Games", "Prices"]}
        tabs={GAMES_TABS}
      />

      {data && summary && (
        <Card>
          <div className="prices__facts">
            <div><span className="prices__fact-label">Base</span><span className="prices__fact-value">{data.baseCurrency}</span></div>
            <div><span className="prices__fact-label">Markup on rate</span><span className="prices__fact-value">{data.markupPercent}%</span></div>
            {summary.perCurrency.filter((p) => p.currency !== data.baseCurrency).map((p) => (
              <div key={p.currency}>
                <span className="prices__fact-label">{p.currency} · rate {data.rates[p.currency] ?? "—"}</span>
                <span className="prices__fact-value">
                  {p.sold}/{summary.total} sold
                  {p.manual > 0 && <span className="prices__muted"> · {p.manual} manual</span>}
                  {p.missing > 0 && <span className="prices__warn"> · {p.missing} missing</span>}
                </span>
              </div>
            ))}
            <Link className="prices__link" to="/admin/payments/currencies">Rates & FX →</Link>
          </div>
        </Card>
      )}

      <Card>
        <div className="prices__toolbar">
          <input className="input prices__search" type="search" placeholder="Find a game…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <label className="prices__check">
            <input type="checkbox" checked={onlyManual} onChange={(e) => setOnlyManual(e.target.checked)} /> only with manual prices
          </label>
          <span className="prices__muted">{rows.length} game{rows.length === 1 ? "" : "s"}</span>
        </div>

        {loading && !data ? (
          <p className="prices__muted">Loading…</p>
        ) : !data || data.currencies.length === 0 ? (
          <p className="prices__muted">No storefront currencies configured.</p>
        ) : (
          <div className="prices__table-wrap">
            <table className="admin-table prices__table">
              <thead>
                <tr>
                  <th>Game</th>
                  {data.currencies.map((c) => (
                    <th key={c} className="prices__col">
                      {c}
                      {c === data.baseCurrency && <span className="prices__pill">base</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => (
                  <tr key={g.gameId}>
                    <td className="prices__title" title={g.title}>{g.title}</td>
                    {data.currencies.map((c) => {
                      const cell = g.cells[c];
                      const isEditing = editing?.gameId === g.gameId && editing.currency === c;
                      return (
                        <td key={c} className={`prices__cell prices__cell--${cell?.source ?? "none"}${isEditing ? " is-editing" : ""}`}>
                          {isEditing ? (
                            <input
                              className="input prices__input"
                              type="number"
                              step="any"
                              min={0}
                              autoFocus
                              disabled={saving}
                              value={editing.value}
                              placeholder={c === g.baseCurrency ? "" : "by rate"}
                              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  commit();
                                }
                                if (e.key === "Escape") {
                                  setEditing(null);
                                }
                              }}
                              onBlur={commit}
                            />
                          ) : (
                            <button
                              type="button"
                              className="prices__value"
                              title={`${SOURCE_LABEL[cell?.source ?? "none"]} — click to edit`}
                              onClick={() => setEditing({ gameId: g.gameId, currency: c, value: cell?.manual != null ? String(cell.manual) : "" })}
                            >
                              <span className="prices__amount">{cell?.price != null ? formatMoney(cell.price, c) : "—"}</span>
                              <span className="prices__source">{SOURCE_LABEL[cell?.source ?? "none"]}</span>
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default PricesPage;
