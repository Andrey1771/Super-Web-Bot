import React, { useEffect, useMemo, useState } from "react";
import container from "../../../inversify.config";
import type { IApiClient } from "../../../iterfaces/i-api-client";
import type { IUrlService } from "../../../iterfaces/i-url-service";
import IDENTIFIERS from "../../../constants/identifiers";
import PageHeader, { GAMES_TABS } from "../../layout/PageHeader";
import Card from "../../ui/Card";
import Drawer from "../../ui/Drawer";
import EmptyState from "../../ui/EmptyState";
import useDebouncedValue from "../../../hooks/useDebouncedValue";
import { useToast } from "../../ui/ToastProvider";
import type { MediaAsset, MediaUsage } from "../../../types/media";
import { useAdminHeader } from "../../layout/AdminHeaderContext";
import { isPlaceholderThumbnailUrl, resolveMediaUrl } from "../../../utils/media";

const pageSize = 24;

/** Сколько файлов заливаем одновременно. Больше — и медленный канал начинает захлёбываться. */
const UPLOAD_CONCURRENCY = 3;

/** Файл в очереди загрузки и что с ним стало. */
type UploadEntry = {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

const SiteChangerPage: React.FC = () => {
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [typeFilter, setTypeFilter] = useState<"all" | "image" | "video">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  /**
   * Очередь загрузки: файл и что с ним стало. Пачку заливаем по одному файлу за запрос —
   * так сервер не получает сотни мегабайт одним телом, а упавший файл не тянет за собой
   * остальные: у каждого свой исход, и он виден в списке.
   */
  const [uploadQueue, setUploadQueue] = useState<UploadEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [usage, setUsage] = useState<MediaUsage[]>([]);
  const [usageCount, setUsageCount] = useState(0);
  const [usageLoading, setUsageLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null);
  const [deleteUsage, setDeleteUsage] = useState<MediaUsage[]>([]);
  const [deleteUsageCount, setDeleteUsageCount] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [brokenThumbnails, setBrokenThumbnails] = useState<Record<string, boolean>>({});
  const [generatingPreviews, setGeneratingPreviews] = useState<Record<string, boolean>>({});
  const { addToast } = useToast();
  const { setPageTitle } = useAdminHeader();
  const apiBaseUrl = container.get<IUrlService>(IDENTIFIERS.IUrlService).apiBaseUrl;

  const debouncedSearch = useDebouncedValue(search, 300);
  /** Маячок под списком: попал на экран — пора грузить следующую страницу. */
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  /**
   * Признак «запрос уже в пути». Именно ref, а не состояние: состояние обновляется к
   * следующей отрисовке, а маячок за это время успевает сработать ещё раз и запросить
   * страницу, которую уже грузят.
   */
  const loadingRef = React.useRef(false);
  /** Меняется, когда список надо перечитать с начала: загрузили файл, удалили, сделали превью. */
  const [reloadTick, setReloadTick] = useState(0);
  const reloadMedia = React.useCallback(() => setReloadTick((tick) => tick + 1), []);

  /**
   * Пометить превью битым — но только если ещё не помечено. Без этой проверки каждая ошибка
   * загрузки писала в состояние новый объект, список перерисовывался, картинка падала снова,
   * и страница уходила в бесконечный круг перерисовок.
   */
  const markThumbnailBroken = React.useCallback((assetId: string) => {
    setBrokenThumbnails((prev) => (prev[assetId] ? prev : { ...prev, [assetId]: true }));
  }, []);

  useEffect(() => {
    setPageTitle("Media Manager");
  }, [setPageTitle]);

  /** Что именно спрашиваем у сервера. Меняется — выдача начинается заново. */
  const queryKey = `${debouncedSearch}|${typeFilter}`;

  useEffect(() => {
    setPage(1);
    void fetchMedia(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, reloadTick]);

  // Следующие страницы дописываются к уже показанным — их просит прокрутка, а не кнопка.
  useEffect(() => {
    if (page === 1) {
      return;
    }
    void fetchMedia(page, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  /**
   * Догрузка по прокрутке: как только маячок под списком показывается на экране, просим
   * следующую страницу. rootMargin в 400px — чтобы страница подъезжала до того, как человек
   * упрётся в конец списка.
   */
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || loading || !canGoNext) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !loadingRef.current) {
          loadingRef.current = true;
          setPage((prev) => prev + 1);
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  });

  const fetchMedia = async (pageNumber: number, replace: boolean) => {
    try {
      loadingRef.current = true;
      setLoading(true);
      setError(null);
      if (replace) {
        setBrokenThumbnails({});
      }
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      const response = await apiClient.api.get(
        `/api/media?search=${encodeURIComponent(debouncedSearch)}&page=${pageNumber}&pageSize=${pageSize}&type=${typeFilter}`
      );
      const batch = (response.data.items ?? []) as MediaAsset[];
      setItems((prev) => {
        if (replace) {
          return batch;
        }
        // Файл мог приехать дважды, если между запросами что-то загрузили: страницы
        // сдвигаются, и без проверки одна и та же карточка появилась бы в списке два раза.
        const known = new Set(prev.map((item) => item.id));
        return [...prev, ...batch.filter((item) => !known.has(item.id))];
      });
      setTotal(response.data.total ?? 0);
    } catch (error) {
      console.error("Error loading media", error);
      setError("Failed to load media library.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  const fetchUsage = async (assetId: string, forDelete = false) => {
    try {
      setUsageLoading(true);
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      const response = await apiClient.api.get(`/api/media/${assetId}/usage`);
      const list = response.data.usedBy ?? [];
      const count = response.data.count ?? list.length;
      if (forDelete) {
        setDeleteUsage(list);
        setDeleteUsageCount(count);
      } else {
        setUsage(list);
        setUsageCount(count);
      }
    } catch (error) {
      console.error("Failed to load usage", error);
      addToast("Unable to load usage details.", "error");
    } finally {
      setUsageLoading(false);
    }
  };

  const handleOpenDetails = (asset: MediaAsset) => {
    setSelectedAsset(asset);
    setDrawerOpen(true);
    setUsage([]);
    setUsageCount(0);
    fetchUsage(asset.id);
  };

  const uploadDone = uploadQueue.filter((entry) => entry.status === "done").length;
  const uploadFailed = uploadQueue.filter((entry) => entry.status === "error").length;
  const uploadPending = uploadQueue.filter(
    (entry) => entry.status === "pending" || entry.status === "error",
  ).length;

  const addToUploadQueue = (files: FileList | null) => {
    const picked = Array.from(files ?? []);
    if (picked.length === 0) {
      return;
    }

    setUploadQueue((prev) => {
      // Тот же файл могли выбрать дважды (например, добавив вторую пачку) — не заливаем повторно.
      const known = new Set(prev.map((entry) => `${entry.file.name}:${entry.file.size}`));
      const fresh = picked
        .filter((file) => !known.has(`${file.name}:${file.size}`))
        .map((file) => ({ file, status: "pending" as const }));
      return [...prev, ...fresh];
    });
  };

  /**
   * Заливка очереди. Файлы идут пачками по UPLOAD_CONCURRENCY: последовательно — медленно на
   * полусотне файлов, все разом — забивают канал и упираются в лимиты сервера.
   *
   * Ошибка одного файла не останавливает остальные: причина остаётся у него в строке, и
   * повторить можно только упавшие, не перезаливая уже загруженное.
   */
  const handleUpload = async () => {
    const pending = uploadQueue.filter((entry) => entry.status === "pending" || entry.status === "error");
    if (pending.length === 0) {
      addToast("Choose files to upload.", "error");
      return;
    }

    setUploading(true);
    const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);

    const setStatus = (file: File, status: UploadEntry["status"], error?: string) =>
      setUploadQueue((prev) =>
        prev.map((entry) => (entry.file === file ? { ...entry, status, error } : entry)),
      );

    const queue = [...pending];
    let uploaded = 0;
    let failed = 0;

    const worker = async () => {
      for (;;) {
        const next = queue.shift();
        if (!next) {
          return;
        }

        setStatus(next.file, "uploading");
        try {
          const formData = new FormData();
          formData.append("file", next.file);
          await apiClient.api.post("/api/media/upload", formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          setStatus(next.file, "done");
          uploaded++;
        } catch (error: any) {
          console.error("Upload failed", error);
          const message = error?.response?.data ?? "Upload failed.";
          setStatus(next.file, "error", typeof message === "string" ? message : "Upload failed.");
          failed++;
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queue.length) }, worker));
    setUploading(false);

    if (uploaded > 0) {
      addToast(
        failed === 0
          ? `Uploaded ${uploaded} file(s) to the library.`
          : `Uploaded ${uploaded}, failed ${failed}. Failed files stay in the list — press Upload to retry them.`,
        failed === 0 ? "success" : "error",
      );
      reloadMedia();
    } else {
      addToast(`All ${failed} file(s) failed. See the list for the reason.`, "error");
    }

    // Окно закрываем только когда заливать больше нечего: с упавшими файлами человек
    // должен увидеть, что именно не прошло.
    if (failed === 0) {
      setUploadOpen(false);
      setUploadQueue([]);
    }
  };

  const handleDeleteRequest = async (asset: MediaAsset) => {
    setDeleteTarget(asset);
    setDeleteUsage([]);
    setDeleteUsageCount(0);
    setDeleteOpen(true);
    await fetchUsage(asset.id, true);
  };

  const handleDelete = async (force: boolean) => {
    if (!deleteTarget) {
      return;
    }
    try {
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      const response = await apiClient.api.delete(`/api/media/${deleteTarget.id}?force=${force}`);
      if (response.data.deleted) {
        addToast("Media deleted.", "success");
        setDeleteOpen(false);
        setDeleteTarget(null);
        reloadMedia();
      } else {
        addToast("Media is currently in use.", "error");
        setDeleteUsageCount(response.data.usedByCount ?? deleteUsageCount);
      }
    } catch (error) {
      console.error("Delete failed", error);
      addToast("Failed to delete media.", "error");
    }
  };

  const handleCopy = async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addToast(successMessage, "success");
    } catch (error) {
      console.error("Copy failed", error);
      addToast("Copy failed.", "error");
    }
  };

  const handleGeneratePreview = async (asset: MediaAsset) => {
    try {
      setGeneratingPreviews((prev) => ({ ...prev, [asset.id]: true }));
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      const response = await apiClient.api.post(`/api/media/${asset.id}/generate-thumbnail`);
      const updated = response.data as MediaAsset;
      setItems((prev) => prev.map((item) => (item.id === asset.id ? updated : item)));
      setSelectedAsset((prev) => (prev?.id === asset.id ? updated : prev));
      setBrokenThumbnails((prev) => {
        const next = { ...prev };
        delete next[asset.id];
        return next;
      });
      addToast("Preview generated.", "success");
    } catch (error: any) {
      console.error("Preview generation failed", error);
      const message = error?.response?.data ?? "Failed to generate preview.";
      addToast(typeof message === "string" ? message : "Failed to generate preview.", "error");
    } finally {
      setGeneratingPreviews((prev) => ({ ...prev, [asset.id]: false }));
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) {
      return "0 B";
    }
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) {
      return "—";
    }
    const date = new Date(dateString);
    return date.toLocaleDateString("ru-RU", { year: "numeric", month: "short", day: "numeric" });
  };

  const formatDuration = (seconds?: number | null) => {
    if (!seconds && seconds !== 0) {
      return null;
    }
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes}:${remaining.toString().padStart(2, "0")}`;
  };

  const canGoNext = page * pageSize < total;

  const emptyState = !loading && items.length === 0 && !error;

  const renderGrid = useMemo(() => {
    if (loading) {
      return (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="skeleton h-40" />
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <EmptyState
          title="Unable to load media"
          description={error}
          action={
            <button className="btn btn-primary" onClick={reloadMedia}>
              Retry
            </button>
          }
        />
      );
    }

    if (emptyState) {
      return (
        <EmptyState
          title="No media yet"
          description="Upload the first image or video to build your library."
          action={
            <button className="btn btn-primary" onClick={() => setUploadOpen(true)}>
              Upload first media
            </button>
          }
        />
      );
    }

    if (view === "list") {
      return (
        <div className="space-y-3">
          {items.map((item) => {
            const isVideo = item.type === "video" || item.contentType?.startsWith("video");
            const resolvedThumbnail = resolveMediaUrl(item.thumbnailUrl ?? undefined, apiBaseUrl);
            const resolvedUrl = resolveMediaUrl(item.url, apiBaseUrl);
            const showPreviewMissing = isVideo && (!resolvedThumbnail || brokenThumbnails[item.id] || isPlaceholderThumbnailUrl(item.thumbnailUrl));
            const isGenerating = generatingPreviews[item.id];
            return (
            <Card key={item.id} className="flex items-center gap-4 media-card media-card--row">
              {isVideo ? (
                !showPreviewMissing ? (
                  <div className="relative h-16 w-20 overflow-hidden rounded">
                    <img
                      src={resolvedThumbnail}
                      alt={item.filename}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                      onError={() => markThumbnailBroken(item.id)}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-white">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50">▶</span>
                    </span>
                  </div>
                ) : (
                  <div className="flex h-16 w-20 flex-col items-center justify-center gap-1 rounded bg-gray-100 text-[11px] text-gray-500">
                    <span>Preview missing</span>
                    <span
                      role="button"
                      tabIndex={0}
                      className="text-xs text-indigo-600 hover:underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleGeneratePreview(item);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          handleGeneratePreview(item);
                        }
                      }}
                      aria-disabled={isGenerating}
                    >
                      {isGenerating ? "Generating..." : "Generate preview"}
                    </span>
                  </div>
                )
              ) : (
                <img
                  src={resolvedThumbnail || resolvedUrl}
                  alt={item.filename}
                  className="h-16 w-20 rounded object-cover"
                  loading="lazy"
                  decoding="async"
                />
              )}
              <div className="flex-1">
                <p className="font-semibold">{item.filename}</p>
                <p className="text-xs text-gray-500">
                  {formatBytes(item.sizeBytes)} • {formatDate(item.createdAt)}
                </p>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-outline" onClick={() => handleOpenDetails(item)}>
                  View
                </button>
                <button className="btn btn-outline" onClick={() => handleCopy(item.url, "Link copied")}>Copy link</button>
                <button className="btn btn-outline" onClick={() => handleDeleteRequest(item)}>
                  Delete
                </button>
              </div>
            </Card>
            );
          })}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => {
          const isVideo = item.type === "video" || item.contentType?.startsWith("video");
          const resolvedThumbnail = resolveMediaUrl(item.thumbnailUrl ?? undefined, apiBaseUrl);
          const resolvedUrl = resolveMediaUrl(item.url, apiBaseUrl);
          const showPreviewMissing = isVideo && (!resolvedThumbnail || brokenThumbnails[item.id] || isPlaceholderThumbnailUrl(item.thumbnailUrl));
          const isGenerating = generatingPreviews[item.id];
          return (
          <div key={item.id} className="media-card border rounded-lg p-3 bg-white shadow-sm">
            <button className="w-full" onClick={() => handleOpenDetails(item)}>
              <div className="h-32 w-full overflow-hidden rounded">
                {isVideo ? (
                  !showPreviewMissing ? (
                    <div className="relative h-full w-full">
                      <img
                        src={resolvedThumbnail}
                        alt={item.filename}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                        onError={() => markThumbnailBroken(item.id)}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-white">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50">▶</span>
                      </span>
                      {formatDuration(item.durationSec) && (
                        <span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
                          {formatDuration(item.durationSec)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gray-100 text-xs text-gray-500">
                      <span>Preview missing</span>
                      <span
                        role="button"
                        tabIndex={0}
                        className="text-xs text-indigo-600 hover:underline"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleGeneratePreview(item);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            handleGeneratePreview(item);
                          }
                        }}
                        aria-disabled={isGenerating}
                      >
                        {isGenerating ? "Generating..." : "Generate preview"}
                      </span>
                    </div>
                  )
                ) : (
                  <img
                    src={resolvedThumbnail || resolvedUrl}
                    alt={item.filename}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                )}
              </div>
            </button>
            <div className="mt-2">
              <p className="text-sm font-semibold truncate" title={item.filename}>
                {item.filename}
              </p>
              <p className="text-xs text-gray-500">
                {formatBytes(item.sizeBytes)} • {formatDate(item.createdAt)}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn btn-outline" onClick={() => handleCopy(item.url, "Link copied")}>Copy link</button>
              <button className="btn btn-outline" onClick={() => handleOpenDetails(item)}>
                Details
              </button>
              <button className="btn btn-outline" onClick={() => handleDeleteRequest(item)}>
                Delete
              </button>
            </div>
          </div>
          );
        })}
      </div>
    );
  }, [items, loading, error, view, emptyState, total, page]);

  return (
    <div className="admin-grid">
      <PageHeader
        title="Media manager"
        description="Upload, review, and clean up assets used across the storefront."
        breadcrumbs={["Games", "Media"]}
        tabs={GAMES_TABS}
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="admin-topbar__search">
            <span>🔎</span>
            <input
              type="text"
              placeholder="Search media..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button className="btn btn-outline" onClick={() => setSearch("")}>✕</button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-2">
              {(["all", "image", "video"] as const).map((tab) => (
                <button
                  key={tab}
                  className={`btn btn-small ${typeFilter === tab ? "btn-primary" : "btn-outline"}`}
                  onClick={() => setTypeFilter(tab)}
                >
                  {tab === "all" ? "All" : tab === "image" ? "Images" : "Videos"}
                </button>
              ))}
            </div>
            <select className="input" defaultValue="newest">
              <option value="newest">Newest first</option>
            </select>
            <button
              className={`btn ${view === "grid" ? "btn-primary" : "btn-outline"}`}
              onClick={() => setView("grid")}
            >
              Grid
            </button>
            <button
              className={`btn ${view === "list" ? "btn-primary" : "btn-outline"}`}
              onClick={() => setView("list")}
            >
              List
            </button>
          </div>
        </div>
        <div className="mt-4">{renderGrid}</div>

        {/* Маячок догрузки. Кнопок «вперёд-назад» здесь больше нет: на тридцати тысячах файлов
            это тысяча с лишним страниц, и до нужной не долистать — быстрее найти поиском,
            а остальное подъезжает само по мере прокрутки. */}
        <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />

        {!emptyState && !error && (
          <p className="mt-4 text-xs text-gray-500">
            {loading && items.length > 0
              ? `Loading… ${items.length} of ${total} assets`
              : `${items.length} of ${total} assets loaded`}
          </p>
        )}
      </Card>

      <Drawer isOpen={drawerOpen} title="Media details" onClose={() => setDrawerOpen(false)}>
        {selectedAsset ? (
          <div className="space-y-4">
            <div className="h-48 w-full overflow-hidden rounded border">
              {(selectedAsset.type === "video" || selectedAsset.contentType?.startsWith("video")) ? (
                <video
                  controls
                  preload="metadata"
                  poster={resolveMediaUrl(selectedAsset.thumbnailUrl ?? undefined, apiBaseUrl)}
                  className="h-full w-full object-contain bg-black"
                >
                  <source src={resolveMediaUrl(selectedAsset.url, apiBaseUrl)} type={selectedAsset.contentType ?? "video/mp4"} />
                </video>
              ) : (
                <img src={resolveMediaUrl(selectedAsset.url, apiBaseUrl)} alt={selectedAsset.filename} className="h-full w-full object-cover" />
              )}
            </div>
            {(selectedAsset.type === "video" || selectedAsset.contentType?.startsWith("video")) && (!selectedAsset.thumbnailUrl || isPlaceholderThumbnailUrl(selectedAsset.thumbnailUrl)) && (
              <div className="flex items-center gap-3 text-sm text-amber-700">
                <span>Preview missing.</span>
                <button
                  className="btn btn-outline btn-small"
                  onClick={() => handleGeneratePreview(selectedAsset)}
                  disabled={generatingPreviews[selectedAsset.id]}
                >
                  {generatingPreviews[selectedAsset.id] ? "Generating..." : "Generate preview"}
                </button>
              </div>
            )}
            <Card>
              <h3>Details</h3>
              <p><strong>Filename:</strong> {selectedAsset.filename}</p>
              <p><strong>Size:</strong> {formatBytes(selectedAsset.sizeBytes)}</p>
              <p><strong>Type:</strong> {selectedAsset.type ?? "image"} ({selectedAsset.contentType})</p>
              <p><strong>Created:</strong> {formatDate(selectedAsset.createdAt)}</p>
              <p><strong>Dimensions:</strong> {selectedAsset.width && selectedAsset.height ? `${selectedAsset.width}×${selectedAsset.height}` : "—"}</p>
              {(selectedAsset.type === "video" || selectedAsset.contentType?.startsWith("video")) && (
                <p><strong>Duration:</strong> {formatDuration(selectedAsset.durationSec) ?? "—"}</p>
              )}
            </Card>
            <Card>
              <h3>Link</h3>
              <div className="flex items-center gap-2">
                <input type="text" readOnly value={selectedAsset.url} className="w-full p-2 border rounded" />
                <button className="btn btn-outline" onClick={() => handleCopy(selectedAsset.url, "Link copied")}>Copy</button>
                <button className="btn btn-outline" onClick={() => window.open(selectedAsset.url, "_blank", "noopener,noreferrer")}>Open</button>
              </div>
            </Card>
            <Card>
              <h3>Usage</h3>
              <p className="text-sm text-gray-600">Used in: {usageCount} games</p>
              {usageLoading ? (
                <p className="text-xs text-gray-500">Loading usage...</p>
              ) : usageCount > 0 ? (
                <ul className="mt-2 space-y-1 text-sm">
                  {usage.map((game) => (
                    <li key={game.gameId}>{game.gameTitle}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">Not used in any game yet.</p>
              )}
            </Card>
            <div className="flex gap-2">
              <button className="btn btn-outline" onClick={() => handleDeleteRequest(selectedAsset)}>
                Delete
              </button>
            </div>
          </div>
        ) : (
          <EmptyState
            title="No media selected"
            description="Select an asset from the list to view details here."
          />
        )}
      </Drawer>

      {uploadOpen && (
        <div className="admin-modal" onClick={() => (uploading ? undefined : setUploadOpen(false))}>
          <div className="admin-modal__card" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">Upload media</h2>

            {/* multiple: файлы заливаются пачкой, по одному запросу на файл. */}
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              disabled={uploading}
              onChange={(event) => {
                addToUploadQueue(event.target.files);
                // Сбрасываем значение, иначе повторный выбор тех же файлов не даст события.
                event.target.value = "";
              }}
              className="mb-4"
            />

            {uploadQueue.length > 0 && (
              <>
                <p className="text-sm text-gray-600 mb-2">
                  {uploadDone} of {uploadQueue.length} uploaded
                  {uploadFailed > 0 ? `, ${uploadFailed} failed` : ""}
                </p>
                <ul className="media-upload-queue">
                  {uploadQueue.map((entry) => (
                    <li key={`${entry.file.name}:${entry.file.size}`} className="media-upload-queue__item">
                      <span className="media-upload-queue__name" title={entry.file.name}>
                        {entry.file.name}
                      </span>
                      <span className={`media-upload-queue__status media-upload-queue__status--${entry.status}`}>
                        {entry.status === "done"
                          ? "uploaded"
                          : entry.status === "uploading"
                            ? "uploading…"
                            : entry.status === "error"
                              ? entry.error ?? "failed"
                              : formatBytes(entry.file.size)}
                      </span>
                      {!uploading && entry.status !== "done" && (
                        <button
                          type="button"
                          className="media-upload-queue__remove"
                          title="Remove from the queue"
                          onClick={() =>
                            setUploadQueue((prev) => prev.filter((item) => item.file !== entry.file))
                          }
                        >
                          ✕
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button className="btn btn-outline" onClick={() => setUploadOpen(false)} disabled={uploading}>
                {uploadDone > 0 && !uploading ? "Close" : "Cancel"}
              </button>
              <button className="btn btn-primary" onClick={handleUpload} disabled={uploading || uploadPending === 0}>
                {uploading
                  ? `Uploading… ${uploadDone}/${uploadQueue.length}`
                  : uploadFailed > 0
                    ? `Retry ${uploadFailed} failed`
                    : `Upload ${uploadPending || ""}`.trim()}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteOpen && deleteTarget && (
        <div className="admin-modal" onClick={() => setDeleteOpen(false)}>
          <div className="admin-modal__card" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-2">Delete “{deleteTarget.filename}”?</h2>
            <p className="text-sm text-gray-600 mb-4">This action cannot be undone.</p>
            {deleteUsageCount > 0 ? (
              <div className="mb-4">
                <p className="text-sm text-red-600">Used in {deleteUsageCount} games.</p>
                <ul className="mt-2 max-h-32 overflow-y-auto text-sm">
                  {deleteUsage.map((game) => (
                    <li key={game.gameId}>{game.gameTitle}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-gray-600 mb-4">Not used in any game.</p>
            )}
            <div className="flex justify-end gap-2">
              <button className="btn btn-outline" onClick={() => setDeleteOpen(false)}>
                Cancel
              </button>
              {deleteUsageCount > 0 ? (
                <button className="btn btn-primary" onClick={() => handleDelete(true)}>
                  Force delete & detach
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => handleDelete(false)}>
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SiteChangerPage;
