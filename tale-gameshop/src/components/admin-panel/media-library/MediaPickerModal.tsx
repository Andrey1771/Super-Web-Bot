import React, { useEffect, useMemo, useState } from "react";
import container from "../../../inversify.config";
import type { IApiClient } from "../../../iterfaces/i-api-client";
import IDENTIFIERS from "../../../constants/identifiers";
import Card from "../../ui/Card";
import { useToast } from "../../ui/ToastProvider";
import { MediaAsset } from "../../../types/media";

type MediaPickerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (asset: MediaAsset) => void;
  initialSelectedId?: string;
};

const MediaPickerModal: React.FC<MediaPickerModalProps> = ({ isOpen, onClose, onSelect, initialSelectedId }) => {
  const [activeTab, setActiveTab] = useState<"library" | "upload">("library");
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { addToast } = useToast();

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setActiveTab("library");
    setUploadFile(null);
    setUploadError(null);
    setSelectedId(initialSelectedId ?? null);
    fetchMedia();
  }, [initialSelectedId, isOpen]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) {
      return items;
    }
    const lower = search.toLowerCase();
    return items.filter((item) => item.filename.toLowerCase().includes(lower));
  }, [items, search]);

  const fetchMedia = async () => {
    try {
      setLoading(true);
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      const response = await apiClient.api.get("/api/media?page=1&pageSize=60");
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
      setActiveTab("library");
      addToast("Image uploaded to library.", "success");
    } catch (error) {
      console.error("Upload failed", error);
      setUploadError("Failed to upload. Try a different image.");
    } finally {
      setUploading(false);
    }
  };

  const handleUseSelected = () => {
    const selected = items.find((item) => item.id === selectedId);
    if (!selected) {
      addToast("Select an image first.", "error");
      return;
    }
    onSelect(selected);
    onClose();
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

            <Card className="max-h-[360px] overflow-y-auto">
              {loading ? (
                <div className="space-y-3">
                  <div className="skeleton h-10" />
                  <div className="skeleton h-10" />
                  <div className="skeleton h-10" />
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center text-gray-500 py-8">No media found. Upload a new image.</div>
              ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                  {filteredItems.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={`border rounded-lg p-2 text-left transition hover:shadow ${
                        selectedId === item.id ? "border-indigo-500 ring-2 ring-indigo-200" : "border-gray-200"
                      }`}
                    >
                      <div className="h-28 w-full overflow-hidden rounded">
                        <img src={item.url} alt={item.filename} className="h-full w-full object-cover" />
                      </div>
                      <div className="mt-2 text-sm font-medium truncate" title={item.filename}>
                        {item.filename}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {selectedId ? "1 item selected" : "Select an image to continue"}
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
                accept="image/*"
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
