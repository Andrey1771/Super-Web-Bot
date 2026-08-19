import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../../layout/PageHeader";
import Card from "../../ui/Card";
import { useAdminHeader } from "../../layout/AdminHeaderContext";
import container from "../../../inversify.config";
import IDENTIFIERS from "../../../constants/identifiers";
import type { IApiClient } from "../../../iterfaces/i-api-client";
import { formatMoney } from "../../../utils/format-money";
import "./admin-panel-page.css";
import { keycloakConsoleUrl } from "../../layout/Sidebar";

/**
 * Главная страница админки — сводка «что сегодня горит».
 *
 * Раньше здесь стояли заглушки: «System status: Operational», «Orders today: —» и статичный
 * список «Upcoming tasks». Теперь всё приходит одним запросом /api/admin/dashboard, а каждая
 * карточка ведёт в раздел, где с этим работают. Обновляется раз в минуту — тот же ритм, что
 * у списка чатов поддержки.
 */

type Dashboard = {
  generatedAtUtc: string;
  baseCurrency: string;
  orders?: {
    todayCount: number;
    todayRevenue: number;
    weekCount: number;
    weekRevenue: number;
    awaitingPayment: number;
    awaitingKeys: number;
    failed: number;
  } | null;
  keys?: {
    awaitingKeys: number;
    outOfStockGames: number;
    lowStockGames: number;
    attention: Array<{ gameId: string; title: string; available: number; awaiting: number; kind: "awaiting" | "out" | "low" }>;
  } | null;
  support?: {
    chatsNeedingAgent: number;
    chatsAssigned: number;
    openTickets: number;
    oldestWaitingMinutes: number | null;
  } | null;
  payments?: { openFailures: number } | null;
  content?: { pendingReviews: number; unansweredQuestions: number } | null;
  health?: { items: Array<{ name: string; state: "ok" | "warn" | "down" | "unconfigured"; detail?: string }> } | null;
};

const REFRESH_MS = 60_000;

const formatWait = (minutes: number): string =>
  minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;

const AdminPanelPage: React.FC = () => {
  const { setHeaderActions, setPageTitle } = useAdminHeader();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const api = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      const response = await api.api.get<Dashboard>("/api/admin/dashboard");
      setData(response.data);
      setError(null);
    } catch (err: any) {
      console.error("Failed to load dashboard", err);
      const status = err?.response?.status;
      setError(status ? `The dashboard endpoint answered ${status}.` : "The backend did not respond.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPageTitle("Dashboard");
    setHeaderActions([
      { type: "button", id: "dashboard-refresh", label: "Refresh", variant: "outline", onClick: () => load() },
    ]);
  }, [load, setHeaderActions, setPageTitle]);

  useEffect(() => {
    load();
    const interval = window.setInterval(() => load(true), REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [load]);

  const currency = data?.baseCurrency ?? "USD";
  const orders = data?.orders;
  const keys = data?.keys;
  const support = data?.support;
  const payments = data?.payments;
  const content = data?.content;
  const health = data?.health;

  // «Требует внимания» — конкретные вещи, а не счётчики: сюда попадает только то, где ноль
  // не является нормой. Пустой список — тоже ответ, и его так и пишем.
  const attention: Array<{ key: string; text: string; to: string; tone: "danger" | "warn" }> = [];
  if (keys) {
    keys.attention
      .filter((row) => row.kind === "awaiting")
      .forEach((row) =>
        attention.push({
          key: `await-${row.gameId}`,
          text: `${row.awaiting} paid ${row.awaiting === 1 ? "order waits" : "orders wait"} for a key: ${row.title}`,
          to: "/admin/games/keys",
          tone: "danger",
        })
      );
    keys.attention
      .filter((row) => row.kind === "out")
      .forEach((row) =>
        attention.push({ key: `out-${row.gameId}`, text: `Out of keys: ${row.title}`, to: "/admin/games/keys", tone: "warn" })
      );
  }
  if (support && support.chatsNeedingAgent > 0) {
    attention.push({
      key: "chats",
      text: `${support.chatsNeedingAgent} ${support.chatsNeedingAgent === 1 ? "chat waits" : "chats wait"} for a specialist${
        support.oldestWaitingMinutes != null ? ` (oldest ${formatWait(support.oldestWaitingMinutes)})` : ""
      }`,
      to: "/admin/support/live-chat",
      tone: support.oldestWaitingMinutes != null && support.oldestWaitingMinutes >= 15 ? "danger" : "warn",
    });
  }
  if (payments && payments.openFailures > 0) {
    attention.push({
      key: "payments",
      text: `${payments.openFailures} payment ${payments.openFailures === 1 ? "failure" : "failures"} to review`,
      to: "/admin/payments/issues",
      tone: "danger",
    });
  }
  if (orders && orders.failed > 0) {
    attention.push({ key: "failed", text: `${orders.failed} failed ${orders.failed === 1 ? "order" : "orders"}`, to: "/admin/orders", tone: "warn" });
  }
  if (content && content.pendingReviews > 0) {
    attention.push({ key: "reviews", text: `${content.pendingReviews} reported review${content.pendingReviews === 1 ? "" : "s"} to moderate`, to: "/admin/support/moderation", tone: "warn" });
  }
  if (content && content.unansweredQuestions > 0) {
    attention.push({ key: "questions", text: `${content.unansweredQuestions} unanswered question${content.unansweredQuestions === 1 ? "" : "s"} on game pages`, to: "/admin/support/moderation?tab=questions", tone: "warn" });
  }

  return (
    <div className="admin-grid dashboard">
      <PageHeader
        title="Admin overview"
        description="What needs attention today — orders, keys, support and payments in one place."
        breadcrumbs={["Admin", "Dashboard"]}
      />

      {error && !data && (
        <Card>
          <div className="dashboard__error">
            <strong>Dashboard unavailable.</strong> {error}{" "}
            <button className="btn btn-outline" type="button" onClick={() => load()}>
              Retry
            </button>
          </div>
        </Card>
      )}

      <div className="admin-grid admin-grid--4 dashboard__tiles">
        <Link className="dashboard__tile" to="/admin/orders">
          <span className="dashboard__tile-label">Orders today</span>
          <span className="dashboard__tile-value">{orders ? orders.todayCount : loading ? "…" : "—"}</span>
          <span className="dashboard__tile-sub">
            {orders ? `${formatMoney(orders.todayRevenue, currency)} · ${orders.weekCount} this week` : "—"}
          </span>
        </Link>
        <Link className={`dashboard__tile${orders && orders.awaitingKeys > 0 ? " dashboard__tile--danger" : ""}`} to="/admin/games/keys">
          <span className="dashboard__tile-label">Paid, waiting for keys</span>
          <span className="dashboard__tile-value">{orders ? orders.awaitingKeys : loading ? "…" : "—"}</span>
          <span className="dashboard__tile-sub">
            {keys ? `${keys.outOfStockGames} out of stock · ${keys.lowStockGames} low` : "—"}
          </span>
        </Link>
        <Link className={`dashboard__tile${support && support.chatsNeedingAgent > 0 ? " dashboard__tile--warn" : ""}`} to="/admin/support/live-chat">
          <span className="dashboard__tile-label">Support queue</span>
          <span className="dashboard__tile-value">{support ? support.chatsNeedingAgent : loading ? "…" : "—"}</span>
          <span className="dashboard__tile-sub">
            {support ? `${support.chatsAssigned} in progress · ${support.openTickets} open tickets` : "—"}
          </span>
        </Link>
        <Link className={`dashboard__tile${payments && payments.openFailures > 0 ? " dashboard__tile--danger" : ""}`} to="/admin/payments/issues">
          <span className="dashboard__tile-label">Payment issues</span>
          <span className="dashboard__tile-value">{payments ? payments.openFailures : loading ? "…" : "—"}</span>
          <span className="dashboard__tile-sub">{orders ? `${orders.awaitingPayment} awaiting payment` : "—"}</span>
        </Link>
      </div>

      <div className="admin-grid admin-grid--2">
        <Card>
          <h3>Needs attention</h3>
          {loading && !data ? (
            <p className="dashboard__muted">Loading…</p>
          ) : attention.length === 0 ? (
            <p className="dashboard__muted">Nothing is waiting on you right now.</p>
          ) : (
            <ul className="dashboard__attention">
              {attention.map((item) => (
                <li key={item.key} className={`dashboard__attention-item dashboard__attention-item--${item.tone}`}>
                  <Link to={item.to}>{item.text}</Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h3>Services</h3>
          {health ? (
            <ul className="dashboard__health">
              {health.items.map((item) => (
                <li key={item.name} className="dashboard__health-item" title={item.detail}>
                  <span className={`dashboard__dot dashboard__dot--${item.state}`} aria-hidden="true" />
                  <span className="dashboard__health-name">{item.name}</span>
                  <span className="dashboard__health-detail">{item.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dashboard__muted">{loading ? "Checking…" : "—"}</p>
          )}
          {data && (
            <p className="dashboard__muted dashboard__updated">
              Updated {new Date(data.generatedAtUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · refreshes every minute
            </p>
          )}
        </Card>
      </div>

      <Card>
        <h3>Quick navigation</h3>
        <div className="flex gap-3 flex-wrap">
          <Link className="btn btn-outline" to="/admin/orders">Orders</Link>
          <Link className="btn btn-outline" to="/admin/cardAdder">Catalog</Link>
          <Link className="btn btn-outline" to="/admin/games/keys">Game keys</Link>
          <Link className="btn btn-outline" to="/admin/support/live-chat">Live chat</Link>
          <Link className="btn btn-outline" to="/admin/support/tickets">Tickets</Link>
          <Link className="btn btn-outline" to="/admin/promo-codes">Promo codes</Link>
          {keycloakConsoleUrl() && (
            <a className="btn btn-outline" href={keycloakConsoleUrl()} target="_blank" rel="noopener noreferrer" title="Opens the Keycloak admin console in a new tab. Login: KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD from .env">
              Keycloak console ↗
            </a>
          )}
        </div>
      </Card>
    </div>
  );
};

export default AdminPanelPage;
