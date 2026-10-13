import React, { useCallback, useEffect, useState } from "react";
import PageHeader from "../../components/layout/PageHeader";
import { DataGrid, Column, Paging, Scrolling } from "../../components/grid";
import { GRID_PAGE_SIZE } from "../../hooks/use-grid-window";
import { useAdminHeader } from "../../components/layout/AdminHeaderContext";
import { getInventoryValueReport, type InventoryValueReport } from "../../api/adminReportsApi";
import KeyCostBackfill from "./KeyCostBackfill";
import { formatMoney } from "../../utils/format-money";

/**
 * Склад в деньгах: сколько ключей лежит непроданными и на какую сумму закуплено.
 *
 * Дат здесь нет намеренно. «Сколько денег заморожено» — вопрос про сейчас, а не про отрезок
 * времени: за прошлый вторник склад посчитать нечем и незачем.
 */

const InventoryValuePage: React.FC = () => {
  const { setPageTitle } = useAdminHeader();
  const [report, setReport] = useState<InventoryValueReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBackfill, setShowBackfill] = useState(false);

  useEffect(() => setPageTitle("Inventory value"), [setPageTitle]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getInventoryValueReport());
    } catch (err: any) {
      setReport(null);
      setError(err?.response?.data?.message ?? "Failed to build the report.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const money = (value: number) => formatMoney(value, report?.baseCurrency ?? "USD");

  return (
    <div className="admin-grid">
      <PageHeader
        title="Inventory value"
        description="Keys sitting in the pool and how much was paid for them."
        breadcrumbs={["Reports", "Inventory value"]}
      />

      <div className="admin-card">
        <div className="admin-card__body">
          <button type="button" className="btn btn-outline btn-small" disabled={loading} onClick={load}>
            {loading ? "Counting…" : "Refresh"}
          </button>
          {report && (
            <p className="editor-pick__hint">Snapshot taken {new Date(report.generatedAtUtc).toLocaleString()}.</p>
          )}
        </div>
      </div>

      {error && <div className="admin-card"><div className="admin-card__body">{error}</div></div>}

      {report && !error && (
        <>
          {!report.totals.valueComplete && (
            <div className="card-completeness">
              <div className="card-completeness__head">
                <strong>Inventory is worth more than shown</strong>
              </div>
              <ul className="card-completeness__list">
                <li className="card-completeness__item card-completeness__item--warning">
                  <span className="card-completeness__pill">Missing cost</span>
                  <span>
                    {report.totals.keysWithoutCost} of {report.totals.keysAvailable} keys in stock have no purchase
                    price — they add nothing to the total. Keys uploaded before cost tracking are the usual reason.
                  </span>
                </li>
              </ul>
            </div>
          )}

          {/* Починка стоит рядом с жалобой: страница говорит «столько-то ключей без цены» —
              здесь же их и заполняют, а не ищут для этого другой экран. */}
          {report.totals.keysWithoutCost > 0 && (
            <div className="admin-card">
              <div className="admin-card__body">
                <button type="button" className="btn btn-outline btn-small" onClick={() => setShowBackfill((value) => !value)}>
                  {showBackfill ? "Hide" : "Fill in missing purchase prices"}
                </button>
                {showBackfill && <KeyCostBackfill onApplied={load} />}
              </div>
            </div>
          )}

          <div className="report-tiles">
            <div className="report-tile report-tile--total">
              <span className="report-tile__label">Money on the shelf</span>
              <strong className="report-tile__value">{money(report.totals.value)}</strong>
              <span className="report-tile__note">
                {report.totals.keysAvailable} key(s) across {report.totals.games} game(s)
              </span>
            </div>
            <div className="report-tile">
              <span className="report-tile__label">Priced</span>
              <strong className="report-tile__value">
                {report.totals.keysAvailable - report.totals.keysWithoutCost} / {report.totals.keysAvailable}
              </strong>
              <span className="report-tile__note">keys with a known purchase price</span>
            </div>
            <div className="report-tile">
              <span className="report-tile__label">Written off</span>
              <strong className="report-tile__value">−{money(report.totals.writtenOffValue)}</strong>
              <span className="report-tile__note">{report.totals.writtenOffKeys} voided key(s)</span>
            </div>
          </div>

          <div className="admin-card">
            <div className="admin-card__body">
              <h3 style={{ margin: 0 }}>How long it has been sitting</h3>
              {/* Ключ, лежащий полгода, стоит столько же, сколько вчерашний, но означает другое:
                  деньги, вложенные в то, что не продаётся. */}
              <div style={{ overflowX: "auto" }}>
                <table className="admin-table report-table">
                  <thead>
                    <tr>
                      <th>Age</th>
                      <th className="report-table__num">Keys</th>
                      <th className="report-table__num">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.aging.map((bucket) => (
                      <tr key={bucket.label}>
                        <td>
                          {bucket.label}
                          {bucket.unknown && (
                            <span className="report-table__gone" title="Uploaded before cost tracking existed"> · no purchase date</span>
                          )}
                        </td>
                        <td className="report-table__num">{bucket.keys}</td>
                        <td className="report-table__num">{bucket.value ? money(bucket.value) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="admin-card">
            <div className="admin-card__body">
              <h3 style={{ margin: 0 }}>By game</h3>
              {/* Отчёт приходит целиком — сервер его не листает. Виртуальная прокрутка нужна
                  затем, чтобы в DOM жили только видимые строки: игр со склада бывает много.
                  Сортировка честная — весь список уже в браузере. */}
              <DataGrid
                dataSource={report.rows}
                keyExpr="gameId"
                showBorders
                showRowLines
                height={460}
                width="100%"
                columnAutoWidth
                allowColumnResizing
                columnResizingMode="widget"
                noDataText="No keys in stock."
              >
                <Scrolling mode="virtual" rowRenderingMode="virtual" showScrollbar="always" />
                <Paging enabled pageSize={GRID_PAGE_SIZE} />

                <Column
                  dataField="title"
                  caption="Game"
                  minWidth={240}
                  cellRender={(cell) => (
                    <span>
                      {cell.data.title}
                      {!cell.data.inCatalog && (
                        <span className="report-table__gone" title="No longer in the catalog"> · removed</span>
                      )}
                    </span>
                  )}
                />
                <Column dataField="keysAvailable" caption="Keys" width={110} alignment="right" />
                <Column
                  dataField="value"
                  caption="Value"
                  width={150}
                  alignment="right"
                  cellRender={(cell) =>
                    cell.data.valueComplete ? (
                      <span>{money(cell.data.value)}</span>
                    ) : (
                      // Сумма без части цен всегда меньше настоящей — показываем со звёздочкой,
                      // а не как факт.
                      <span
                        className="report-table__unsure"
                        title={`${cell.data.keysWithoutCost} key(s) have no purchase price — the value is understated`}
                      >
                        {money(cell.data.value)}*
                      </span>
                    )
                  }
                />
                <Column
                  dataField="daysOnShelf"
                  caption="Oldest"
                  width={110}
                  alignment="right"
                  cellRender={(cell) => <span>{cell.data.daysOnShelf === null ? "—" : `${cell.data.daysOnShelf} d`}</span>}
                />
              </DataGrid>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default InventoryValuePage;
