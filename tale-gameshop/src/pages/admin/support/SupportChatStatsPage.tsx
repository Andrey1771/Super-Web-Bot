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
  high_risk: "Риск: взлом, чарджбэк, суд",
  customer_request: "Клиент попросил человека",
  assistant_decision: "Решение ассистента",
  unknown: "Без источника (старые диалоги)",
};

const percent = (value: number) => `${Math.round(value * 100)}%`;
const money = (value: number) => `$${value.toFixed(value < 1 ? 4 : 2)}`;

const SupportChatStatsPage: React.FC = () => {
  const { setHeaderActions, setPageTitle } = useAdminHeader();
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<SupportChatStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPageTitle("Support / Chat stats");
    setHeaderActions([]);
  }, [setHeaderActions, setPageTitle]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await getSupportChatStats(days));
    } catch (err) {
      console.error(err);
      setError("Не удалось загрузить статистику.");
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
        { type: "column", name: "Закрыл бот", data: daily.map((p) => p.sessions - p.escalated), color: COLOR_SOLVED },
        { type: "column", name: "Ушло к человеку", data: daily.map((p) => p.escalated), color: COLOR_ESCALATED },
      ],
    };
  }, [stats]);

  const feedbackTotal = (stats?.feedbackHelpful ?? 0) + (stats?.feedbackNotHelpful ?? 0);

  return (
    <div className="chat-stats">
      <div className="chat-stats__periods" role="group" aria-label="Период">
        {PERIODS.map((option) => (
          <button
            key={option}
            type="button"
            className={`chat-stats__period${option === days ? " is-active" : ""}`}
            onClick={() => setDays(option)}
          >
            {option} дней
          </button>
        ))}
        <button type="button" className="chat-stats__period" onClick={load} disabled={loading}>
          Обновить
        </button>
      </div>

      {error && <Card><div className="chat-stats__error">{error}</div></Card>}

      {!error && loading && !stats && <Card><div className="chat-stats__empty">Загружаем…</div></Card>}

      {stats && (
        <>
          <div className="chat-stats__tiles">
            <Card>
              <div className="chat-stats__tile">
                <span className="chat-stats__tile-label">Закрыто без оператора</span>
                <strong className="chat-stats__tile-value">{percent(stats.deflectionRate)}</strong>
                <span className="chat-stats__tile-note">
                  {stats.sessions - stats.escalatedSessions} из {stats.sessions} обращений
                </span>
              </div>
            </Card>
            <Card>
              <div className="chat-stats__tile">
                <span className="chat-stats__tile-label">Обращений за период</span>
                <strong className="chat-stats__tile-value">{stats.sessions}</strong>
                <span className="chat-stats__tile-note">
                  {stats.aiReplies} ответов бота · {stats.instantReplies} без модели
                </span>
              </div>
            </Card>
            <Card>
              <div className="chat-stats__tile">
                <span className="chat-stats__tile-label">Стоимость периода</span>
                <strong className="chat-stats__tile-value">{money(stats.totalCostUsd)}</strong>
                <span className="chat-stats__tile-note">
                  {money(stats.costPerSessionUsd)} за диалог · платных ответов {stats.billedReplies}
                </span>
              </div>
            </Card>
            <Card>
              <div className="chat-stats__tile">
                <span className="chat-stats__tile-label">Потрачено сегодня</span>
                <strong className="chat-stats__tile-value">{money(stats.spentTodayUsd)}</strong>
                <span className="chat-stats__tile-note">
                  {stats.dailyBudgetUsd > 0 ? `лимит ${money(stats.dailyBudgetUsd)}` : "лимит не задан"}
                </span>
              </div>
            </Card>
          </div>

          <Card>
            <div className="chat-stats__section-title">Обращения по дням</div>
            {stats.sessions === 0 ? (
              <div className="chat-stats__empty">За выбранный период обращений не было.</div>
            ) : (
              <HighchartsReact highcharts={Highcharts} options={chartOptions} />
            )}
          </Card>

          <div className="chat-stats__columns">
            <Card>
              <div className="chat-stats__section-title">Почему звали человека</div>
              <RankedList
                items={stats.escalationsBySource.map((item) => ({
                  label: SOURCE_LABELS[item.label] ?? item.label,
                  count: item.count,
                }))}
                emptyText="Ни одного переключения на оператора."
              />
            </Card>

            <Card>
              <div className="chat-stats__section-title">Частые темы</div>
              <RankedList items={stats.topCategories} emptyText="Тем пока не набралось." />
            </Card>
          </div>

          <Card>
            <div className="chat-stats__section-title">Оценки ответов</div>
            {feedbackTotal === 0 ? (
              <div className="chat-stats__empty">Клиенты пока не оценивали ответы.</div>
            ) : (
              <div className="chat-stats__feedback">
                <div className="chat-stats__tile">
                  <span className="chat-stats__tile-label">Помогло</span>
                  <strong className="chat-stats__tile-value">{stats.feedbackHelpful}</strong>
                </div>
                <div className="chat-stats__tile">
                  <span className="chat-stats__tile-label">Не помогло</span>
                  <strong className="chat-stats__tile-value">{stats.feedbackNotHelpful}</strong>
                </div>
                <div className="chat-stats__tile">
                  <span className="chat-stats__tile-label">Доля довольных</span>
                  <strong className="chat-stats__tile-value">
                    {percent(stats.feedbackHelpful / feedbackTotal)}
                  </strong>
                  <span className="chat-stats__tile-note">оценок всего {feedbackTotal}</span>
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
