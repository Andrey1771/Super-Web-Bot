import React, { useCallback, useEffect, useMemo, useState } from "react";
import HighchartsReact from "highcharts-react-official";
import Highcharts from "highcharts";
import Card from "../../../components/ui/Card";
import { getSupportChatStats } from "../../../api/supportChatApi";
import type { SupportChatStats } from "../../../types/support-chat";
import { useAdminHeader } from "../../../components/layout/AdminHeaderContext";
import "./support-chat-stats.css";

// Две серии, проверенные на цветовую слепоту: фиолетовый — фирменный, янтарный — контрастная пара.
const COLOR_SOLVED = "#7c3aed";
const COLOR_ESCALATED = "#d97706";
const SURFACE = "#ffffff";

const PERIODS = [7, 30, 90];

const SOURCE_LABELS: Record<string, string> = {
  high_risk: "Risk: hijack, chargeback, legal",
  customer_request: "Customer asked in their own words",
  customer_button: "Customer pressed the button",
  assistant_decision: "Assistant decision",
  unknown: "No source (legacy chats)",
};

const percent = (value: number) => `${Math.round(value * 100)}%`;
const money = (value: number) => `$${value.toFixed(value < 1 ? 4 : 2)}`;

const SupportChatStatsPage: React.FC = () => {
  const { setPageTitle } = useAdminHeader();
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<SupportChatStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPageTitle("Support / Chat stats");
  }, [setPageTitle]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await getSupportChatStats(days));
    } catch (err) {
      console.error(err);
      setError("Could not load the stats.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const chartOptions = useMemo<Highcharts.Options>(() => {
    const daily = stats?.daily ?? [];
    return {
      chart: { type: "column", height: 280, backgroundColor: "transparent", spacing: [8, 0, 0, 0] },
      title: { text: undefined },
      credits: { enabled: false },
      accessibility: { enabled: false },
      xAxis: {
        categories: daily.map((point) => new Date(point.date).toLocaleDateString([], { day: "2-digit", month: "2-digit" })),
        lineColor: "#e5e7eb",
        tickColor: "#e5e7eb",
        labels: { style: { color: "#4b5563", fontSize: "11px" } },
      },
      yAxis: {
        title: { text: undefined },
        allowDecimals: false,
        gridLineColor: "#eef0f4",
        labels: { style: { color: "#4b5563", fontSize: "11px" } },
      },
      legend: { align: "left", itemStyle: { color: "#4b5563", fontWeight: "500", fontSize: "12px" } },
      tooltip: { shared: true, backgroundColor: "#ffffff", borderColor: "#e5e7eb", style: { fontSize: "12px" } },
      plotOptions: {
        column: {
          stacking: "normal",
          borderRadius: 4,
          // Полоска цвета фона между сегментами — так стопка читается как две величины, а не одна.
          borderWidth: 2,
          borderColor: SURFACE,
          groupPadding: 0.12,
          pointPadding: 0.04,
        },
      },
      series: [
        { type: "column", name: "Closed by bot", data: daily.map((p) => p.sessions - p.escalated), color: COLOR_SOLVED },
        { type: "column", name: "Escalated to a human", data: daily.map((p) => p.escalated), color: COLOR_ESCALATED },
      ],
    };
  }, [stats]);

  const feedbackTotal = (stats?.feedbackHelpful ?? 0) + (stats?.feedbackNotHelpful ?? 0);

  return (
    <div className="chat-stats">
      <div className="chat-stats__periods" role="group" aria-label="Period">
        {PERIODS.map((option) => (
          <button
            key={option}
            type="button"
            className={`chat-stats__period${option === days ? " is-active" : ""}`}
            onClick={() => setDays(option)}
          >
            {option} days
          </button>
        ))}
        <button type="button" className="chat-stats__period" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      {error && <Card><div className="chat-stats__error">{error}</div></Card>}

      {!error && loading && !stats && <Card><div className="chat-stats__empty">Loading…</div></Card>}

      {stats && (
        <>
          <div className="chat-stats__tiles">
            <Card>
              <div className="chat-stats__tile">
                <span className="chat-stats__tile-label">Closed without an operator</span>
                <strong className="chat-stats__tile-value">{percent(stats.deflectionRate)}</strong>
                <span className="chat-stats__tile-note">
                  {stats.sessions - stats.escalatedSessions} of {stats.sessions} chats
                </span>
              </div>
            </Card>
            <Card>
              <div className="chat-stats__tile">
                <span className="chat-stats__tile-label">Chats in period</span>
                <strong className="chat-stats__tile-value">{stats.sessions}</strong>
                <span className="chat-stats__tile-note">
                  {stats.aiReplies} bot replies · {stats.instantReplies} without the model
                </span>
              </div>
            </Card>
            <Card>
              <div className="chat-stats__tile">
                <span className="chat-stats__tile-label">Period cost</span>
                <strong className="chat-stats__tile-value">{money(stats.totalCostUsd)}</strong>
                <span className="chat-stats__tile-note">
                  {money(stats.costPerSessionUsd)} per chat · billed replies {stats.billedReplies}
                </span>
              </div>
            </Card>
            <Card>
              <div className="chat-stats__tile">
                <span className="chat-stats__tile-label">Spent today</span>
                <strong className="chat-stats__tile-value">{money(stats.spentTodayUsd)}</strong>
                <span className="chat-stats__tile-note">
                  {stats.dailyBudgetUsd > 0 ? `limit ${money(stats.dailyBudgetUsd)}` : "no limit set"}
                </span>
              </div>
            </Card>
          </div>

          <Card>
            <div className="chat-stats__section-title">Chats per day</div>
            {stats.sessions === 0 ? (
              <div className="chat-stats__empty">No chats in the selected period.</div>
            ) : (
              <HighchartsReact highcharts={Highcharts} options={chartOptions} />
            )}
          </Card>

          <div className="chat-stats__columns">
            <Card>
              <div className="chat-stats__section-title">Why a human was called</div>
              <RankedList
                items={stats.escalationsBySource.map((item) => ({
                  label: SOURCE_LABELS[item.label] ?? item.label,
                  count: item.count,
                }))}
                emptyText="No escalations to an operator."
              />
            </Card>

            <Card>
              <div className="chat-stats__section-title">Top topics</div>
              <RankedList items={stats.topCategories} emptyText="No topics yet." />
            </Card>
          </div>

          <Card>
            <div className="chat-stats__section-title">Reply ratings</div>
            {feedbackTotal === 0 ? (
              <div className="chat-stats__empty">No ratings from customers yet.</div>
            ) : (
              <div className="chat-stats__feedback">
                <div className="chat-stats__tile">
                  <span className="chat-stats__tile-label">Helpful</span>
                  <strong className="chat-stats__tile-value">{stats.feedbackHelpful}</strong>
                </div>
                <div className="chat-stats__tile">
                  <span className="chat-stats__tile-label">Not helpful</span>
                  <strong className="chat-stats__tile-value">{stats.feedbackNotHelpful}</strong>
                </div>
                <div className="chat-stats__tile">
                  <span className="chat-stats__tile-label">Satisfaction rate</span>
                  <strong className="chat-stats__tile-value">
                    {percent(stats.feedbackHelpful / feedbackTotal)}
                  </strong>
                  <span className="chat-stats__tile-note">{feedbackTotal} ratings in total</span>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

// Ранжированный список: одна величина на строку, поэтому подпись стоит прямо на ней — легенда не нужна.
const RankedList: React.FC<{ items: Array<{ label: string; count: number }>; emptyText: string }> = ({
  items,
  emptyText,
}) => {
  if (items.length === 0) {
    return <div className="chat-stats__empty">{emptyText}</div>;
  }
  const max = Math.max(...items.map((item) => item.count), 1);

  return (
    <ul className="chat-stats__ranked">
      {items.map((item) => (
        <li key={item.label} className="chat-stats__ranked-row">
          <span className="chat-stats__ranked-label">{item.label}</span>
          <span className="chat-stats__ranked-track">
            <span
              className="chat-stats__ranked-bar"
              style={{ width: `${Math.max(4, (item.count / max) * 100)}%` }}
            />
          </span>
          <span className="chat-stats__ranked-count">{item.count}</span>
        </li>
      ))}
    </ul>
  );
};

export default SupportChatStatsPage;
