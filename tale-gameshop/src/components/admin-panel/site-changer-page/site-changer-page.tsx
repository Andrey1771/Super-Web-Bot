import React, { useEffect, useMemo, useState } from "react";
import container from "../../../inversify.config";
import type { IApiClient } from "../../../iterfaces/i-api-client";
import type { IUrlService } from "../../../iterfaces/i-url-service";
import IDENTIFIERS from "../../../constants/identifiers";
import PageHeader from "../../layout/PageHeader";
import Card from "../../ui/Card";
import Drawer from "../../ui/Drawer";
import EmptyState from "../../ui/EmptyState";
import useDebouncedValue from "../../../hooks/useDebouncedValue";
import { useToast } from "../../ui/ToastProvider";
import type { MediaAsset, MediaUsage } from "../../../types/media";
import { useAdminHeader } from "../../layout/AdminHeaderContext";
import { isPlaceholderThumbnailUrl, resolveMediaUrl } from "../../../utils/media";

const pageSize = 24;

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
  const [uploadFile, setUploadFile] = useState<File | null>(null);
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
  const { setHeaderActions, setPageTitle } = useAdminHeader();
  const apiBaseUrl = container.get<IUrlService>(IDENTIFIERS.IUrlService).apiBaseUrl;

  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    fetchMedia();
  }, [page, debouncedSearch, typeFilter]);

  useEffect(() => {
    setPageTitle("Media Manager");
    setHeaderActions([
      {
        type: "button",
        id: "upload-media",
        label: "Upload",
        variant: "primary",
        onClick: () => setUploadOpen(true),
      },
    ]);
    return () => setHeaderActions([]);
  }, [setHeaderActions, setPageTitle]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const fetchMedia = async () => {
    try {
      setLoading(true);
      setError(null);
      setBrokenThumbnails({});
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      const response = await apiClient.api.get(
        `/api/media?search=${encodeURIComponent(debouncedSearch)}&page=${page}&pageSize=${pageSize}&type=${typeFilter}`
      );
      setItems(response.data.items ?? []);
      setTotal(response.data.total ?? 0);
    } catch (error) {
      console.error("Error loading media", error);
      setError("Failed to load media library.");
    } finally {
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

  const handleUpload = async () => {
    if (!uploadFile) {
      addToast("Choose a file to upload.", "error");
      return;
    }
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", uploadFile);
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      await apiClient.api.post("/api/media/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      addToast("Media uploaded to library.", "success");
      setUploadOpen(false);
      setUploadFile(null);
      setPage(1);
      fetchMedia();
    } catch (error: any) {
      console.error("Upload failed", error);
      const message = error?.response?.data ?? "Upload failed. Try again.";
      addToast(typeof message === "string" ? message : "Upload failed. Try again.", "error");
    } finally {
      setUploading(false);
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
        setPage(1);
        fetchMedia();
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
            <button className="btn btn-primary" onClick={fetchMedia}>
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
            <Card key={item.id} className="flex items-center gap-4">
              {isVideo ? (
                !showPreviewMissing ? (
                  <div className="relative h-16 w-20 overflow-hidden rounded">
                    <img
                      src={resolvedThumbnail}
                      alt={item.filename}
                      className="h-full w-full object-cover"
                      onError={() => setBrokenThumbnails((prev) => ({ ...prev, [item.id]: true }))}
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
                <img src={resolvedUrl} alt={item.filename} className="h-16 w-20 rounded object-cover" />
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
          <div key={item.id} className="border rounded-lg p-3 bg-white shadow-sm">
            <button className="w-full" onClick={() => handleOpenDetails(item)}>
              <div className="h-32 w-full overflow-hidden rounded">
                {isVideo ? (
                  !showPreviewMissing ? (
                    <div className="relative h-full w-full">
                      <img
                        src={resolvedThumbnail}
                        alt={item.filename}
                        className="h-full w-full object-cover"
                        onError={() => setBrokenThumbnails((prev) => ({ ...prev, [item.id]: true }))}
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
                  <img src={resolvedUrl} alt={item.filename} className="h-full w-full object-cover" />
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
        breadcrumbs={["System", "Media"]}
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

        {!emptyState && !error && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total} assets
            </p>
            <div className="flex gap-2">
              <button className="btn btn-outline" onClick={() => setPage((prev) => Math.max(prev - 1, 1))} disabled={page === 1}>
                Previous
              </button>
              <button className="btn btn-outline" onClick={() => setPage((prev) => prev + 1)} disabled={!canGoNext}>
                Next
              </button>
            </div>
          </div>
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
        <div className="admin-modal" onClick={() => setUploadOpen(false)}>
          <div className="admin-modal__card" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">Upload media</h2>
            <input
              type="file"
              accept="image/*,video/*"
              onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
              className="mb-4"
            />
            {uploadFile && <p className="text-sm text-gray-600">Selected: {uploadFile.name}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn btn-outline" onClick={() => setUploadOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleUpload} disabled={uploading}>
                {uploading ? "Uploading..." : "Upload"}
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
