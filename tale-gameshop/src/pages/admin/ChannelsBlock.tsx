import React from "react";
import type { ChannelReport } from "../../api/adminReportsApi";
import { formatMoney } from "../../utils/format-money";
import ChannelSpendPanel from "./ChannelSpendPanel";

/**
 * Каналы привлечения: откуда приходят покупатели и сколько на них зарабатывают.
 *
 * Разрез, которого внешняя аналитика дать не может: Google знает источник перехода, но не
 * знает ни закупочной цены ключа, ни того, сколько за этот переход заплатили. Здесь после
 * выручки вычтена настоящая себестоимость — та, что привязана к ключам конкретного заказа, —
 * а после неё рекламные траты, занесённые руками.
 *
 * Две вещи показываются приглушённо или не показываются вовсе. Маржа без полного расхода:
 * ноль себестоимости выглядит отличным результатом, хотя означает лишь отсутствие данных.
 * Окупаемость без занесённых трат: пустая клетка честнее нуля, потому что «не платили» и
 * «не записали, сколько заплатили» — разные вещи.
 */
const ChannelsBlock: React.FC<{
  report: ChannelReport;
  fromUtc: string;
  toUtc: string;
  onSpendChanged: () => void;
}> = ({ report, fromUtc, toUtc, onSpendChanged }) => {
  const money = (value: number) => formatMoney(value, report.baseCurrency);
  const hasSpend = report.totals.sourcesWithSpend > 0;

  return (
    <div className="admin-card">
      <div className="admin-card__body">
        <h3 style={{ margin: 0 }}>By channel</h3>

        <div className="report-tiles">
          <div className="report-tile">
            <span className="report-tile__label">Repeat customers</span>
            <strong className="report-tile__value">
              {report.repeat.repeatSharePercent === null ? "—" : `${report.repeat.repeatSharePercent}%`}
            </strong>
            <span className="report-tile__note">
              {report.repeat.repeatBuyers} of {report.repeat.buyersInPeriod} buyers had bought before
            </span>
          </div>
          <div className="report-tile">
            <span className="report-tile__label">Ad spend</span>
            <strong className="report-tile__value">{hasSpend ? money(report.totals.spend) : "—"}</strong>
            <span className="report-tile__note">
              {hasSpend
                ? `recorded for ${report.totals.sourcesWithSpend} source(s)`
                : "nothing recorded — payback unknown"}
            </span>
          </div>
          <div className="report-tile report-tile--total">
            <span className="report-tile__label">Profit after ads</span>
            <strong className="report-tile__value">
              {hasSpend ? money(report.totals.grossProfit - report.totals.spend) : "—"}
            </strong>
            {/* Считается только по занесённым тратам: то, что не записали, здесь не вычтено,
                и настоящая цифра может оказаться меньше. */}
            <span className="report-tile__note">
              {hasSpend ? "gross profit minus the spend you recorded" : "record ad spend to see it"}
            </span>
          </div>
          <div className="report-tile">
            <span className="report-tile__label">Without a source</span>
            <strong className="report-tile__value">{report.totals.unattributedOrders}</strong>
            {/* Прямые заходы и всё, что оформлено до появления атрибуции, попадают в одну
                строку: полезно знать, насколько велика эта слепая зона. */}
            <span className="report-tile__note">orders shown as (direct)</span>
          </div>
        </div>

        {report.rows.length === 0 ? (
          <p className="editor-pick__hint">No paid orders in this period.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table report-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th className="report-table__num">Orders</th>
                  <th className="report-table__num">Revenue</th>
                  <th className="report-table__num">Cost</th>
                  <th className="report-table__num">Gross profit</th>
                  <th className="report-table__num">Margin</th>
                  <th className="report-table__num">Ad spend</th>
                  <th className="report-table__num">After ads</th>
                  <th
                    className="report-table__num"
                    title="Gross profit per unit of ad spend. Below 1.0 the channel loses money."
                  >
                    Return
                  </th>
                  <th className="report-table__num">Avg order</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.source}>
                    <td>
                      {row.source}
                      {row.campaigns.length > 0 && (
                        <div className="report-table__gone">{row.campaigns.join(", ")}</div>
                      )}
                    </td>
                    <td className="report-table__num">{row.orders}</td>
                    <td className="report-table__num">{money(row.revenue)}</td>
                    <td className="report-table__num">{row.cost ? `−${money(row.cost)}` : "—"}</td>
                    <td className="report-table__num">{money(row.grossProfit)}</td>
                    <td className="report-table__num">
                      {row.marginPercent === null ? (
                        "—"
                      ) : row.costComplete ? (
                        `${row.marginPercent}%`
                      ) : (
                        <span
                          className="report-table__unsure"
                          title={
                            row.ordersWithoutKeys > 0
                              ? `${row.ordersWithoutKeys} order(s) have no keys issued — their cost is not recorded`
                              : `${row.keysWithoutCost} key(s) have no purchase price — the margin is overstated`
                          }
                        >
                          {row.marginPercent}%*
                        </span>
                      )}
                    </td>
                    <td className="report-table__num">
                      {row.spend === null ? (
                        <span className="report-table__gone" title="No ad spend recorded for this source">
                          —
                        </span>
                      ) : (
                        `−${money(row.spend)}`
                      )}
                    </td>
                    <td className="report-table__num">
                      {row.netProfit === null ? <span className="report-table__gone">—</span> : money(row.netProfit)}
                    </td>
                    <td className="report-table__num">
                      {/* Меньше единицы — канал съедает больше, чем приносит. */}
                      {row.roas === null ? (
                        <span className="report-table__gone">—</span>
                      ) : (
                        <span className={row.roas < 1 ? "report-table__unsure" : undefined}>
                          {row.roas.toFixed(2)}x
                        </span>
                      )}
                    </td>
                    <td className="report-table__num">{row.averageOrder === null ? "—" : money(row.averageOrder)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(report.totals.ordersWithoutKeys > 0 || report.totals.keysWithoutCost > 0) && (
          <p className="editor-pick__hint">
            * Margins marked with an asterisk are overstated:{" "}
            {report.totals.ordersWithoutKeys > 0 && `${report.totals.ordersWithoutKeys} order(s) issued no keys`}
            {report.totals.ordersWithoutKeys > 0 && report.totals.keysWithoutCost > 0 && ", "}
            {report.totals.keysWithoutCost > 0 && `${report.totals.keysWithoutCost} key(s) have no purchase price`}.
          </p>
        )}

        <ChannelSpendPanel
          fromUtc={fromUtc}
          toUtc={toUtc}
          baseCurrency={report.baseCurrency}
          knownSources={report.rows.map((row) => row.source)}
          onChanged={onSpendChanged}
        />
      </div>
    </div>
  );
};

export default ChannelsBlock;
