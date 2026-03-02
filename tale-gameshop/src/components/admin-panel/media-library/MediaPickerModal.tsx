import React, { useEffect, useMemo, useState } from "react";
import container from "../../../inversify.config";
import type { IApiClient } from "../../../iterfaces/i-api-client";
import type { IUrlService } from "../../../iterfaces/i-url-service";
import IDENTIFIERS from "../../../constants/identifiers";
import Card from "../../ui/Card";
import { useToast } from "../../ui/ToastProvider";
import { MediaAsset } from "../../../types/media";
import { isPlaceholderThumbnailUrl, resolveMediaUrl } from "../../../utils/media";

type MediaPickerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (asset: MediaAsset) => void;
  onSelectMany?: (assets: MediaAsset[]) => void;
  initialSelectedId?: string;
  initialSelectedIds?: string[];
  filterType?: "all" | "image" | "video";
  allowMultiple?: boolean;
};

const MIN_SCALE = 0.2;
const MAX_SCALE = 5;
const SCALE_STEP = 0.1;

const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(value.toFixed(2))));

const MediaPickerModal: React.FC<MediaPickerModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  onSelectMany,
  initialSelectedId,
  initialSelectedIds,
  filterType = "all",
  allowMultiple = false,
}) => {
  const [activeTab, setActiveTab] = useState<"library" | "upload">("library");
  const [activeFilter, setActiveFilter] = useState<"all" | "image" | "video">(filterType);
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [brokenThumbnails, setBrokenThumbnails] = useState<Record<string, boolean>>({});
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [selectedPreviewBroken, setSelectedPreviewBroken] = useState(false);
  const [generatingPreviews, setGeneratingPreviews] = useState<Record<string, boolean>>({});
  const [scale, setScale] = useState(1);
  const { addToast } = useToast();
  const apiBaseUrl = container.get<IUrlService>(IDENTIFIERS.IUrlService).apiBaseUrl;

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setActiveTab("library");
    setUploadFile(null);
    setUploadError(null);
    setSelectedId(initialSelectedId ?? null);
    setSelectedIds(initialSelectedIds ?? (initialSelectedId ? [initialSelectedId] : []));
    setActiveFilter(filterType);
    fetchMedia(filterType);
  }, [filterType, initialSelectedId, initialSelectedIds, isOpen]);


  useEffect(() => {
    if (!isOpen) {
      setScale(1);
      return;
    }

    setScale(1);
    setSelectedPreviewBroken(false);
  }, [isOpen, selectedId]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) {
      return items;
    }
    const lower = search.toLowerCase();
    return items.filter((item) => item.filename.toLowerCase().includes(lower));
  }, [items, search]);

  const fetchMedia = async (filter: "all" | "image" | "video" = activeFilter) => {
    try {
      setLoading(true);
      setBrokenThumbnails({});
      setBrokenImages({});
      setSelectedPreviewBroken(false);
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      const response = await apiClient.api.get(
        `/api/media?page=1&pageSize=60&type=${filter}`
      );
      setItems(response.data.items ?? []);
    } catch (error) {
      console.error("Failed to load media", error);
      addToast("Failed to load media library.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      setUploadError("Select a file to upload.");
      return;
    }
    try {
      setUploading(true);
      setUploadError(null);
      const formData = new FormData();
      formData.append("file", uploadFile);
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      const response = await apiClient.api.post("/api/media/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const newAsset = response.data as MediaAsset;
      setItems((prev) => [newAsset, ...prev]);
      setSelectedId(newAsset.id);
      setSelectedIds([newAsset.id]);
      setActiveTab("library");
      addToast("Media uploaded to library.", "success");
    } catch (error: any) {
      console.error("Upload failed", error);
      const message = error?.response?.data ?? "Failed to upload. Try a different file.";
      setUploadError(typeof message === "string" ? message : "Failed to upload. Try a different file.");
    } finally {
      setUploading(false);
    }
  };

  const handleGeneratePreview = async (asset: MediaAsset) => {
    try {
      setGeneratingPreviews((prev) => ({ ...prev, [asset.id]: true }));
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      const response = await apiClient.api.post(`/api/media/${asset.id}/generate-thumbnail`);
      const updated = response.data as MediaAsset;
      setItems((prev) => prev.map((item) => (item.id === asset.id ? updated : item)));
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

  const handleUseSelected = () => {
    if (allowMultiple) {
      const selected = items.filter((item) => selectedIds.includes(item.id));
      if (selected.length === 0) {
        addToast("Select media first.", "error");
        return;
      }
      onSelectMany?.(selected);
      onClose();
      return;
    }

    const selected = items.find((item) => item.id === selectedId);
    if (!selected) {
      addToast("Select media first.", "error");
      return;
    }
    onSelect(selected);
    onClose();
  };


  const handleZoomIn = () => {
    setScale((current) => clampScale(current + SCALE_STEP));
  };

  const handleZoomOut = () => {
    setScale((current) => clampScale(current - SCALE_STEP));
  };

  const handleResetZoom = () => {
    setScale(1);
  };

  const handleImageWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    setScale((current) => clampScale(current + direction * 0.08));
  };

  const selectedAsset = items.find((item) => item.id === selectedId) ?? null;

  const formatDuration = (seconds?: number | null) => {
    if (!seconds && seconds !== 0) {
      return null;
    }
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes}:${remaining.toString().padStart(2, "0")}`;
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="admin-modal" onClick={onClose}>
      <div className="admin-modal__card max-w-4xl w-[92vw]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Select media</h2>
            <p className="text-sm text-gray-500">Choose an asset from the library or upload a new one.</p>
          </div>
          <button className="btn btn-outline" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mt-4 flex gap-3 border-b pb-3">
          <button
            className={`btn ${activeTab === "library" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setActiveTab("library")}
          >
            Library
          </button>
          <button
            className={`btn ${activeTab === "upload" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setActiveTab("upload")}
          >
            Upload
          </button>
        </div>

        {activeTab === "library" && (
          <div className="mt-4 space-y-4">
            {filterType === "all" && (
              <div className="flex gap-2">
                {(["all", "image", "video"] as const).map((tab) => (
                  <button
                    key={tab}
                    className={`btn btn-small ${activeFilter === tab ? "btn-primary" : "btn-outline"}`}
                    onClick={() => {
                      setActiveFilter(tab);
                      fetchMedia(tab);
                    }}
                  >
                    {tab === "all" ? "All" : tab === "image" ? "Images" : "Videos"}
                  </button>
                ))}
              </div>
            )}
            <div className="admin-topbar__search">
              <span>🔎</span>
              <input
                type="text"
                placeholder="Search media..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && (
                <button className="btn btn-outline" onClick={() => setSearch("")}>
                  ✕
                </button>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <Card className="max-h-[360px] overflow-y-auto">
              {loading ? (
                <div className="space-y-3">
                  <div className="skeleton h-10" />
                  <div className="skeleton h-10" />
                  <div className="skeleton h-10" />
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center text-gray-500 py-8">No media found. Upload a new file.</div>
              ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                  {filteredItems.map((item) => {
                    const isVideo = item.type === "video" || item.contentType?.startsWith("video");
                    const resolvedThumbnail = resolveMediaUrl(item.thumbnailUrl ?? undefined, apiBaseUrl);
                    const resolvedUrl = resolveMediaUrl(item.url, apiBaseUrl);
                    const showPreviewMissing = isVideo && (!resolvedThumbnail || brokenThumbnails[item.id] || isPlaceholderThumbnailUrl(item.thumbnailUrl));
                    const isGenerating = generatingPreviews[item.id];
                    return (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => {
                          if (allowMultiple) {
                            setSelectedIds((prev) =>
                              prev.includes(item.id) ? prev.filter((value) => value !== item.id) : [...prev, item.id]
                            );
                          } else {
                            setSelectedId(item.id);
                            setSelectedIds([item.id]);
                          }
                        }}
                        className={`border rounded-lg p-2 text-left transition hover:shadow ${
                          (allowMultiple ? selectedIds.includes(item.id) : selectedId === item.id)
                            ? "border-indigo-500 ring-2 ring-indigo-200"
                            : "border-gray-200"
                        }`}
                      >
                        <div className="h-28 w-full overflow-hidden rounded relative">
                          {isVideo ? (
                            !showPreviewMissing ? (
                              <img
                                src={resolvedThumbnail}
                                alt={item.filename}
                                className="h-full w-full object-cover"
                                onError={() => setBrokenThumbnails((prev) => ({ ...prev, [item.id]: true }))}
                              />
                            ) : (
                              <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gray-100 text-[11px] text-gray-500">
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
                          ) : brokenImages[item.id] || !resolvedUrl ? (
                            <div className="flex h-full w-full items-center justify-center bg-gray-100 text-[11px] text-gray-500">
                              Image unavailable
                            </div>
                          ) : (
                            <img
                              src={resolvedUrl}
                              alt={item.filename}
                              className="h-full w-full object-cover"
                              onError={() => setBrokenImages((prev) => ({ ...prev, [item.id]: true }))}
                            />
                          )}
                          {isVideo && (
                            <span className="absolute inset-0 flex items-center justify-center text-white">
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50">▶</span>
                            </span>
                          )}
                          {isVideo && formatDuration(item.durationSec) && (
                            <span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
                              {formatDuration(item.durationSec)}
                            </span>
                          )}
                        </div>
                        {isVideo && (
                          <span className="mt-2 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
                            Video
                          </span>
                        )}
                        <div className="mt-2 text-sm font-medium truncate" title={item.filename}>
                          {item.filename}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
            <Card>
              <h3 className="text-sm font-semibold">Preview</h3>
              {selectedAsset ? (
                <div className="mt-3 space-y-3">
                  <div className="h-[360px] md:h-[420px] w-full overflow-hidden rounded border bg-gray-50">
                    {selectedAsset.type === "video" || selectedAsset.contentType?.startsWith("video") ? (
                      <video
                        controls
                        preload="metadata"
                        poster={resolveMediaUrl(selectedAsset.thumbnailUrl ?? undefined, apiBaseUrl)}
                        className="h-full w-full bg-black"
                      >
                        <source src={resolveMediaUrl(selectedAsset.url, apiBaseUrl)} type={selectedAsset.contentType ?? "video/mp4"} />
                      </video>
                    ) : (
                      <div
                        className="flex h-full w-full items-center justify-center overflow-hidden"
                        onWheel={handleImageWheel}
                      >
                        {selectedPreviewBroken || !resolveMediaUrl(selectedAsset.url, apiBaseUrl) ? (
                          <div className="flex h-full w-full items-center justify-center bg-gray-100 text-sm text-gray-500">
                            Preview unavailable
                          </div>
                        ) : (
                          <img
                            src={resolveMediaUrl(selectedAsset.url, apiBaseUrl)}
                            alt={selectedAsset.filename}
                            onError={() => setSelectedPreviewBroken(true)}
                            style={{
                              transform: `scale(${scale})`,
                              transformOrigin: 'center center',
                              maxWidth: 'none',
                              maxHeight: 'none',
                              transition: 'transform 160ms ease-out'
                            }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                  {!(selectedAsset.type === "video" || selectedAsset.contentType?.startsWith("video")) && !selectedPreviewBroken && (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button type="button" className="btn btn-outline" onClick={handleZoomOut}>−</button>
                        <button type="button" className="btn btn-outline" onClick={handleZoomIn}>+</button>
                        <button type="button" className="btn btn-outline" onClick={handleResetZoom}>Reset</button>
                      </div>
                      <span className="text-xs text-gray-500">{Math.round(scale * 100)}%</span>
                    </div>
                  )}
                  {(selectedAsset.type === "video" || selectedAsset.contentType?.startsWith("video")) && (!selectedAsset.thumbnailUrl || isPlaceholderThumbnailUrl(selectedAsset.thumbnailUrl)) && (
                    <div className="flex items-center gap-2 text-xs text-amber-700">
                      <span>Preview missing.</span>
                      <button
                        className="text-xs text-indigo-600 hover:underline"
                        onClick={() => handleGeneratePreview(selectedAsset)}
                        disabled={generatingPreviews[selectedAsset.id]}
                      >
                        {generatingPreviews[selectedAsset.id] ? "Generating..." : "Generate preview"}
                      </button>
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold">{selectedAsset.filename}</p>
                    <p className="text-xs text-gray-500">
                      {selectedAsset.type ?? "image"} • {formatDuration(selectedAsset.durationSec) ?? "—"}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-gray-500">Select media to preview.</p>
              )}
            </Card>
          </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {allowMultiple
                  ? selectedIds.length > 0
                    ? `${selectedIds.length} items selected`
                    : "Select media to continue"
                  : selectedId
                    ? "1 item selected"
                    : "Select media to continue"}
              </span>
              <button className="btn btn-primary" onClick={handleUseSelected}>
                Use selected
              </button>
            </div>
          </div>
        )}

        {activeTab === "upload" && (
          <div className="mt-4 space-y-4">
            <div className="border border-dashed rounded-lg p-6 text-center">
              <input
                type="file"
                accept="image/*,video/*"
                onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
              />
              {uploadFile && (
                <p className="text-sm text-gray-600 mt-2">Selected: {uploadFile.name}</p>
              )}
              {uploadError && <p className="text-sm text-red-500 mt-2">{uploadError}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn btn-outline" onClick={() => setActiveTab("library")}>
                Back to library
              </button>
              <button className="btn btn-primary" onClick={handleUpload} disabled={uploading}>
                {uploading ? "Uploading..." : "Upload to library"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaPickerModal;
