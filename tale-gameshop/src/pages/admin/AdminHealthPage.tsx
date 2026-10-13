import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchServiceHealth,
  runServiceHealthCheck,
  type ServiceHealthSnapshot,
} from "../../api/adminHealthApi";
import "./admin-health-page.css";

/**
 * Разбор состояния сервисов.
 *
 * Страница не проверяет ничего сама: она показывает снимки, которые оставил фоновый монитор.
 * Так открытие страницы не создаёт нагрузку на чужие API, и только снимки знают, с какого
 * момента держится состояние — без этого непонятно, авария сейчас или неделю назад.
 */

const STATE_LABEL: Record<string, string> = {
  ok: "Working",
  configured: "Configured, not checked",
  warn: "Unclear",
  down: "Down",
  unconfigured: "Not configured",
};

/** «3 h», «12 min» — человеку нужна длительность, а не отметка времени. */
const formatAge = (iso?: string | null): string | null => {
  if (!iso) {
    return null;
  }
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  if (minutes < 60 * 48) {
    return `${Math.round(minutes / 60)} h`;
  }
  return `${Math.round(minutes / 1440)} d`;
};

const AdminHealthPage: React.FC = () => {
  const [items, setItems] = useState<ServiceHealthSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchServiceHealth());
    } catch (err) {
      console.error(err);
      setError("Could not load the health snapshots.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runNow = async () => {
    setRunning(true);
    setError(null);
    try {
      setItems(await runServiceHealthCheck());
    } catch (err) {
      console.error(err);
      setError("The check could not be run.");
    } finally {
      setRunning(false);
    }
  };

  const broken = items.filter((item) => item.state === "down");
  const lastRun = items.reduce<string | null>(
    (latest, item) => (item.updatedAt && (!latest || item.updatedAt > latest) ? item.updatedAt : latest),
    null
  );

  return (
    <div className="health-page">
      <div className="health-page__head">
        <div>
          <h2 className="health-page__title">Service health</h2>
          <p className="health-page__muted">
            {lastRun
              ? `Checked ${formatAge(lastRun)} ago. Checks run every 5 minutes; a change is emailed.`
              : "No check has run yet. Checks run every 5 minutes; a change is emailed."}
          </p>
        </div>
        <button type="button" className="btn btn-outline" onClick={runNow} disabled={running}>
          {running ? "Checking…" : "Check now"}
        </button>
      </div>

      {error && <p className="health-page__error">{error}</p>}

      {broken.length > 0 && (
        <p className="health-page__summary">
          {broken.length === 1 ? "1 service is down" : `${broken.length} services are down`}:{" "}
          {broken.map((item) => item.name).join(", ")}.
        </p>
      )}

      {loading && items.length === 0 ? (
        <p className="health-page__muted">Loading…</p>
      ) : (
        <ul className="health-page__list">
          {items.map((item) => {
            const age = formatAge(item.since);
            return (
              <li key={item.name} className="health-page__item">
                <span className={`health-page__dot health-page__dot--${item.state}`} aria-hidden="true" />
                <div className="health-page__body">
                  <div className="health-page__name">{item.name}</div>
                  {item.detail && <div className="health-page__detail">{item.detail}</div>}
                </div>
                <div className="health-page__state">
                  <div>{STATE_LABEL[item.state] ?? item.state}</div>
                  {age && <div className="health-page__muted">for {age}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="health-page__muted health-page__footnote">
        The webhook is broken down step by step on the <Link to="/admin/bot">Bot status</Link> page.
        Whether the site itself is reachable from outside is a question this page cannot answer —
        if the site is down, so is this page. That needs an external monitor watching{" "}
        <code>/api/health</code>; see docs/uptime-monitoring.md.
      </p>
    </div>
  );
};

export default AdminHealthPage;
