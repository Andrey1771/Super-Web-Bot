import React, { useCallback, useEffect, useState } from "react";
import PageHeader from "../../components/layout/PageHeader";
import { DataGrid, Column, Paging, Scrolling } from "devextreme-react/data-grid";
import { GRID_PAGE_SIZE } from "../../hooks/use-grid-window";
import { useAdminHeader } from "../../components/layout/AdminHeaderContext";
import {
  getChannelReport,
  getFunnelReport,
  getGameSalesReport,
  getPeriodReport,
  type ChannelReport,
  type FunnelReport,
  type GameSalesReport,
  type PeriodReport,
} from "../../api/adminReportsApi";
import FunnelBlock from "./FunnelBlock";
import ChannelsBlock from "./ChannelsBlock";
import { formatMoney } from "../../utils/format-money";

/**
 * Отчёт за период: выручка, возвраты, себестоимость проданного, валовая прибыль.
 *
 * Главное здесь — не числа, а честность про них. Прибыль складывается из трёх слагаемых, и
 * если хотя бы одно неполное (проданы ключи без закупочной цены, есть частичный возврат без
 * суммы), итог занижает расходы. Раньше такой отчёт просто показал бы красивую цифру; здесь
 * над ней стоит предупреждение с точным числом непокрытых ключей.
 */


/** Начало сегодняшнего дня минус N суток, в UTC. */
const daysAgo = (days: number) => {
  const at = new Date();
  at.setUTCHours(0, 0, 0, 0);
  at.setUTCDate(at.getUTCDate() - days);
  return at.toISOString().slice(0, 10);
};

const today = () => {
  const at = new Date();
  at.setUTCHours(0, 0, 0, 0);
  // Конец периода не включается, поэтому «по сегодня» — это завтрашняя полночь.
  at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString().slice(0, 10);
};

const PRESETS: Array<{ label: string; days: number }> = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

const PeriodReportPage: React.FC = () => {
  const { setPageTitle } = useAdminHeader();
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [report, setReport] = useState<PeriodReport | null>(null);
  const [games, setGames] = useState<GameSalesReport | null>(null);
  const [funnel, setFunnel] = useState<FunnelReport | null>(null);
  const [channels, setChannels] = useState<ChannelReport | null>(null);
  const [showUnsold, setShowUnsold] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setPageTitle("Reports"), [setPageTitle]);

  const load = useCallback(async (fromDate: string, toDate: string) => {
    setLoading(true);
    setError(null);
    try {
      // Оба отчёта об одном периоде — запрашиваем вместе, чтобы на экране не оказалось
      // сводки за один диапазон и разбивки за другой.
      const from = `${fromDate}T00:00:00Z`;
      const to = `${toDate}T00:00:00Z`;
      const [period, byGame, byFunnel, byChannel] = await Promise.all([
        getPeriodReport(from, to),
        getGameSalesReport(from, to),
        getFunnelReport(from, to),
        getChannelReport(from, to),
      ]);
      setReport(period);
      setGames(byGame);
      setFunnel(byFunnel);
      setChannels(byChannel);
    } catch (err: any) {
      setReport(null);
      setGames(null);
      setFunnel(null);
      setChannels(null);
      setError(err?.response?.data?.message ?? "Failed to build the report.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(from, to);
    // Первый расчёт — за период по умолчанию. Дальше только по кнопке: пересчитывать на
    // каждое нажатие в поле даты значит слать запрос на каждую промежуточную дату.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPreset = (days: number) => {
    const nextFrom = daysAgo(days);
    const nextTo = today();
    setFrom(nextFrom);
    setTo(nextTo);
    load(nextFrom, nextTo);
  };

  const money = (value: number) => formatMoney(value, report?.baseCurrency ?? "USD");

  return (
    <div className="admin-grid">
      <PageHeader
        title="Period report"
        description="Revenue, refunds, cost of keys sold and gross profit for a date range."
        breadcrumbs={["Reports", "Period report"]}
      />

      <div className="admin-card">
        <div className="admin-card__body">
          <div className="report-range">
            <label className="admin-field">
              <span className="field-label">From</span>
              <input className="input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label className="admin-field">
              <span className="field-label">To (excluded)</span>
              <input className="input" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
            <button type="button" className="btn btn-primary" disabled={loading} onClick={() => load(from, to)}>
              {loading ? "Counting…" : "Show"}
            </button>
          </div>
          <div className="report-presets">
            {PRESETS.map((preset) => (
              <button key={preset.days} type="button" className="btn btn-outline btn-small" onClick={() => applyPreset(preset.days)}>
                {preset.label}
              </button>
            ))}
          </div>
          {/* Конец периода не включается: иначе соседние месяцы посчитали бы общий день дважды. */}
          <p className="editor-pick__hint">Dates are UTC. The end date is not included in the period.</p>
        </div>
      </div>

      {error && <div className="admin-card"><div className="admin-card__body">{error}</div></div>}

      {report && !error && (
        <>
          {!report.grossProfitComplete && (
            <div className="card-completeness card-completeness--errors">
              <div className="card-completeness__head">
                <strong>Gross profit is understated</strong>
              </div>
              <ul className="card-completeness__list">
                {report.cost.keysWithoutCost > 0 && (
                  <li className="card-completeness__item card-completeness__item--warning">
                    <span className="card-completeness__pill">Missing cost</span>
                    <span>
                      {report.cost.keysWithoutCost} of {report.cost.keysSold} keys sold have no purchase price — their cost is not counted.
                    </span>
                  </li>
                )}
                {/* Продали больше штук, чем выдали ключей: часть расхода вообще не зафиксирована. */}
                {report.cost.keysSold < report.revenue.unitsSold && (
                  <li className="card-completeness__item card-completeness__item--warning">
                    <span className="card-completeness__pill">No keys issued</span>
                    <span>
                      {report.revenue.unitsSold} unit(s) sold but only {report.cost.keysSold} key(s) issued in this
                      period — the cost of the rest is not recorded anywhere.
                    </span>
                  </li>
                )}
                {report.refunds.withoutAmount > 0 && (
                  <li className="card-completeness__item card-completeness__item--warning">
                    <span className="card-completeness__pill">Refund amount missing</span>
                    <span>
                      {report.refunds.withoutAmount} refund(s) in this period were made before amounts were recorded —
                      they are not subtracted.
                    </span>
                  </li>
                )}
              </ul>
            </div>
          )}

          <div className="report-tiles">
            <div className="report-tile">
              <span className="report-tile__label">Revenue</span>
              <strong className="report-tile__value">{money(report.revenue.amount)}</strong>
              <span className="report-tile__note">{report.revenue.orders} paid order(s)</span>
            </div>
            <div className="report-tile">
              <span className="report-tile__label">Refunds</span>
              <strong className="report-tile__value">−{money(report.refunds.amount)}</strong>
              <span className="report-tile__note">{report.refunds.orders} refunded order(s)</span>
            </div>
            <div className="report-tile">
              <span className="report-tile__label">Cost of keys sold</span>
              <strong className="report-tile__value">−{money(report.cost.amount)}</strong>
              <span className="report-tile__note">
                {report.cost.keysWithCost} of {report.cost.keysSold} keys priced
              </span>
            </div>
            <div className={`report-tile report-tile--total${report.grossProfitComplete ? "" : " is-partial"}`}>
              <span className="report-tile__label">Gross profit</span>
              <strong className="report-tile__value">{money(report.grossProfit)}</strong>
              <span className="report-tile__note">
                {report.grossProfitComplete ? "revenue − refunds − cost" : "incomplete — see the note above"}
              </span>
            </div>
          </div>
        </>
      )}

      {/* Воронка идёт сразу за итогами: сначала «сколько заработали», потом «где теряем». */}
      {funnel && !error && <FunnelBlock report={funnel} />}

      {channels && !error && (
        <ChannelsBlock
          report={channels}
          fromUtc={`${from}T00:00:00Z`}
          toUtc={`${to}T00:00:00Z`}
          onSpendChanged={() => load(from, to)}
        />
      )}

      {games && !error && (
        <div className="admin-card">
          <div className="admin-card__body">
            <h3 style={{ margin: 0 }}>By game</h3>
            {/* Отчёт приходит целиком — сервер его не листает. Виртуальная прокрутка нужна
                затем, чтобы в DOM жили только видимые строки: за длинный период проданных игр
                набирается много. Сортировка честная — весь список уже в браузере. */}
            <DataGrid
              dataSource={games.rows}
              keyExpr="gameId"
              showBorders
              showRowLines
              height={460}
              width="100%"
              columnAutoWidth
              allowColumnResizing
              columnResizingMode="widget"
              noDataText="No sales in this period."
            >
              <Scrolling mode="virtual" rowRenderingMode="virtual" showScrollbar="always" />
              <Paging enabled pageSize={GRID_PAGE_SIZE} />

              <Column
                dataField="title"
                caption="Game"
                minWidth={220}
                cellRender={(cell) => (
                  <span>
                    {cell.data.title}
                    {/* Игру могли удалить после продажи — имя берётся из снимка заказа,
                        и об этом честнее сказать, чем сделать вид, что товар на месте. */}
                    {!cell.data.inCatalog && (
                      <span className="report-table__gone" title="No longer in the catalog"> · removed</span>
                    )}
                  </span>
                )}
              />
              <Column
                dataField="unitsSold"
                caption="Units"
                width={110}
                alignment="right"
                cellRender={(cell) => (
                  <span>
                    {cell.data.unitsSold}
                    {cell.data.refundedUnits > 0 && <span className="report-table__gone"> −{cell.data.refundedUnits}</span>}
                  </span>
                )}
              />
              <Column
                dataField="revenue"
                caption="Revenue"
                width={140}
                alignment="right"
                cellRender={(cell) => <span>{money(cell.data.revenue)}</span>}
              />
              <Column
                dataField="refunded"
                caption="Refunded"
                width={130}
                alignment="right"
                cellRender={(cell) => <span>{cell.data.refunded ? `−${money(cell.data.refunded)}` : "—"}</span>}
              />
              <Column
                dataField="cost"
                caption="Cost"
                width={130}
                alignment="right"
                cellRender={(cell) => <span>{cell.data.cost ? `−${money(cell.data.cost)}` : "—"}</span>}
              />
              <Column
                dataField="grossProfit"
                caption="Gross profit"
                width={150}
                alignment="right"
                cellRender={(cell) => <span>{money(cell.data.grossProfit)}</span>}
              />
              <Column
                dataField="marginPercent"
                caption="Margin"
                width={120}
                alignment="right"
                cellRender={(cell) =>
                  cell.data.marginPercent === null ? (
                    <span>—</span>
                  ) : cell.data.costComplete ? (
                    <span>{cell.data.marginPercent}%</span>
                  ) : (
                    // Маржа без известной себестоимости всегда выглядит прекрасно.
                    // Показываем её приглушённо и со звёздочкой, а не как факт.
                    <span className="report-table__unsure" title="Purchase cost unknown for these sales — the margin is overstated">
                      {cell.data.marginPercent}%*
                    </span>
                  )
                }
              />
            </DataGrid>
            {games.totals.rowsWithUnknownCost > 0 && (
              <p className="editor-pick__hint">
                * {games.totals.rowsWithUnknownCost} of {games.totals.gamesSold} rows have no purchase cost recorded —
                their margin is overstated.
              </p>
            )}

            {games.unsold.length > 0 && (
              <>
                {/* Второй вопрос отчёта: во что вложились зря. Эти игры не попадают в таблицу
                    выше именно потому, что не заработали ничего, — и так их было бы не увидеть. */}
                <button type="button" className="btn btn-outline btn-small" onClick={() => setShowUnsold((value) => !value)}>
                  {showUnsold ? "Hide" : "Show"} {games.unsold.length} game(s) with keys but no sales
                </button>
                {showUnsold && (
                  <DataGrid
                    dataSource={games.unsold}
                    keyExpr="gameId"
                    showBorders
                    showRowLines
                    height={360}
                    width="100%"
                    columnAutoWidth
                    noDataText="Every game with keys sold at least once."
                  >
                    <Scrolling mode="virtual" rowRenderingMode="virtual" showScrollbar="always" />
                    <Paging enabled pageSize={GRID_PAGE_SIZE} />

                    <Column dataField="title" caption="Game" minWidth={240} />
                    <Column dataField="keysAvailable" caption="Keys in pool" width={150} alignment="right" />
                  </DataGrid>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PeriodReportPage;
