import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAdminHeader } from "../../components/layout/AdminHeaderContext";
import Card from "../../components/ui/Card";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IApiClient } from "../../iterfaces/i-api-client";
import type { ImportJob } from "../../types/data-tools";
import { useToast } from "../../components/ui/ToastProvider";

const POLL_MS = 4000;

/** Задача ещё идёт: «queued 0/550», «running 12/550». */
export const isActiveJob = (job: ImportJob | null | undefined) => !!job && /^(queued|running)\b/.test(job.status);

/** Доля выполненного по строке статуса «running 12/550». */
export const jobProgress = (job: ImportJob | null | undefined): number | null => {
  const match = job?.status.match(/(\d+)\/(\d+)/);
  if (!match) return null;
  const total = Number(match[2]);
  return total > 0 ? Math.min(100, Math.round((Number(match[1]) / total) * 100)) : null;
};

/**
 * Импорт каталога из Steam. Список appid или ссылок на страницы Steam → фоновая задача на сервере:
 * карточки с описаниями и переводами, скриншоты, трейлеры, требования, обложка. Лимит Steam — около
 * 200 запросов за 5 минут, поэтому 500 игр занимают пару часов; страницу можно закрыть — задача идёт
 * на сервере, а ход виден в списке ниже.
 */
const SteamImportPage: React.FC = () => {
  const { setPageTitle } = useAdminHeader();
  const { addToast } = useToast();
  const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);

  const [text, setText] = useState("");
  const [updateExisting, setUpdateExisting] = useState(false);
  const [refreshPrices, setRefreshPrices] = useState(false);
  const [refreshCovers, setRefreshCovers] = useState(false);
  const [starting, setStarting] = useState(false);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [selected, setSelected] = useState<ImportJob | null>(null);
  const pollRef = useRef<number | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      const response = await apiClient.api.get("/api/admin/steam-import");
      const list = response.data as ImportJob[];
      setJobs(list);
      setSelected((current) => (current ? list.find((job) => job.id === current.id) ?? current : list[0] ?? null));
    } catch (error) {
      console.error(error);
    }
  }, [apiClient]);

  useEffect(() => {
    setPageTitle("Steam import");
    void loadJobs();
  }, [setPageTitle, loadJobs]);

  // Пока есть идущая задача — опрашиваем; закончилась — перестаём.
  const anyActive = jobs.some(isActiveJob);
  useEffect(() => {
    if (!anyActive) return;
    pollRef.current = window.setInterval(() => void loadJobs(), POLL_MS);
    return () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    };
  }, [anyActive, loadJobs]);

  const loadStarter = async () => {
    try {
      const response = await apiClient.api.get("/api/admin/steam-import/starter-catalog");
      setText(response.data.text as string);
      addToast(`Starter catalog loaded: ${response.data.count} games.`, "success");
    } catch {
      addToast("Could not load the starter catalog.", "error");
    }
  };

  const start = async () => {
    setStarting(true);
    try {
      const response = await apiClient.api.post("/api/admin/steam-import", {
        appIds: text,
        updateExisting,
        refreshPrices: updateExisting && refreshPrices,
        refreshCovers: updateExisting && refreshCovers
      });
      addToast(`Import started: ${response.data.total} games.`, "success");
      await loadJobs();
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      addToast(message ?? "Import could not be started.", "error");
    } finally {
      setStarting(false);
    }
  };

  const progress = jobProgress(selected);

  return (
    <div className="data-tools">
      <Card>
        <h3>Import games from Steam</h3>
        <p className="text-sm text-gray-500">
          One Steam app id or store link per line (comments after # are ignored). Each game gets its description and
          translations, screenshots, trailers, system requirements, genres and a cover. Free games, DLC, adult-only titles
          and unreleased games without an exact date and price are skipped. About 15 seconds per game because of Steam's
          rate limit — the import keeps running on the server if you leave this page.
        </p>
        <textarea
          className="data-tools__textarea"
          rows={10}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={"1091500  # Cyberpunk 2077\nhttps://store.steampowered.com/app/292030/"}
          aria-label="Steam app ids"
        />
        <div className="data-tools__options">
          <label className="data-tools__option data-tools__option--row">
            <input type="checkbox" checked={updateExisting} onChange={(event) => setUpdateExisting(event.target.checked)} />
            Update games already in the catalog (descriptions, media, requirements)
          </label>
          <label className="data-tools__option data-tools__option--row">
            <input
              type="checkbox"
              checked={refreshPrices}
              disabled={!updateExisting}
              onChange={(event) => setRefreshPrices(event.target.checked)}
            />
            Also replace their prices with Steam prices
          </label>
          <label className="data-tools__option data-tools__option--row">
            <input
              type="checkbox"
              checked={refreshCovers}
              disabled={!updateExisting}
              onChange={(event) => setRefreshCovers(event.target.checked)}
            />
            Rebuild their covers
          </label>
        </div>
        <div className="data-tools__actions">
          <button className="admin-button" onClick={loadStarter} disabled={starting}>
            Load starter catalog
          </button>
          <button className="admin-button admin-button--primary" onClick={start} disabled={starting || !text.trim()}>
            Start import
          </button>
        </div>
      </Card>

      <Card>
        <h3>Imports</h3>
        {jobs.length === 0 && <p className="text-sm text-gray-500">No Steam imports yet.</p>}
        {jobs.length > 0 && (
          <div className="data-tools__options">
            <label className="data-tools__option">
              Run
              <select value={selected?.id ?? ""} onChange={(event) => setSelected(jobs.find((job) => job.id === event.target.value) ?? null)}>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {new Date(job.startedAt).toLocaleString()} — {job.status}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {selected && (
          <>
            {progress !== null && isActiveJob(selected) && (
              <div className="data-tools__progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="data-tools__progress-bar" style={{ width: `${progress}%` }} />
              </div>
            )}
            <div className="data-tools__summary-grid">
              {[
                ["Status", selected.status],
                ["Created", selected.stats.gamesCreated],
                ["Updated", selected.stats.gamesUpdated],
                ["Skipped", selected.stats.gamesSkipped],
                ["Failed", selected.errors.length]
              ].map(([label, value]) => (
                <div key={label as string} className="data-tools__summary-card">
                  <div className="text-sm text-gray-500">{label}</div>
                  <div className="data-tools__summary-value">{value}</div>
                </div>
              ))}
            </div>
            {selected.errors.length > 0 && (
              <div className="data-tools__issues">
                <h4>Failed</h4>
                <ul>
                  {selected.errors.map((issue, index) => (
                    <li key={`${issue.path}-${index}`}>
                      <strong>{issue.path}</strong>: {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {selected.warnings.length > 0 && (
              <details className="data-tools__issues">
                <summary>Skipped ({selected.warnings.length})</summary>
                <ul>
                  {selected.warnings.map((issue, index) => (
                    <li key={`${issue.path}-${index}`}>
                      <strong>{issue.path}</strong>: {issue.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </Card>
    </div>
  );
};

export default SteamImportPage;
