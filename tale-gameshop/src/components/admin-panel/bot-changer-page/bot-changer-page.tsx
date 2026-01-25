import React, { useMemo, useRef, useState } from "react";
import container from "../../../inversify.config";
import IDENTIFIERS from "../../../constants/identifiers";
import type { IApiClient } from "../../../iterfaces/i-api-client";
import PageHeader from "../../layout/PageHeader";
import Card from "../../ui/Card";
import Drawer from "../../ui/Drawer";
import ModalConfirm from "../../ui/ModalConfirm";
import StickySaveBar from "../../ui/StickySaveBar";
import EmptyState from "../../ui/EmptyState";
import useDebouncedValue from "../../../hooks/useDebouncedValue";
import { useDirtyState } from "../../../hooks/useDirtyState";
import { useToast } from "../../ui/ToastProvider";
import { useAdminHeader } from "../../layout/AdminHeaderContext";

type Translations = {
  [key: string]: string;
};

type Data = {
  keyboardKeys: {
    [key: string]: string;
  };
  translations: {
    [key: string]: Translations;
  };
};

type EditorItem = {
  key: string;
  value: string;
};

const BotChangerPage: React.FC = () => {
  const [editableData, setEditableData] = useState<Data>({
    keyboardKeys: {},
    translations: {},
  });
  const [originalData, setOriginalData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"translations" | "keyboardKeys" | "templates">("translations");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<EditorItem | null>(null);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<Data | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExpandedEditor, setIsExpandedEditor] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { addToast } = useToast();
  const { setHeaderActions, setPageTitle } = useAdminHeader();

  const debouncedSearch = useDebouncedValue(search, 300);

  const languageKey = useMemo(() => {
    const keys = Object.keys(editableData.translations);
    return keys[0] ?? "ru";
  }, [editableData.translations]);

  const activeEntries = useMemo(() => {
    if (activeTab === "translations") {
      return Object.entries(editableData.translations[languageKey] ?? {});
    }
    if (activeTab === "keyboardKeys") {
      return Object.entries(editableData.keyboardKeys ?? {});
    }
    return [];
  }, [activeTab, editableData, languageKey]);

  const filteredEntries = useMemo(() => {
    if (!debouncedSearch) {
      return activeEntries;
    }
    const lower = debouncedSearch.toLowerCase();
    return activeEntries.filter(([key, value]) => {
      return key.toLowerCase().includes(lower) || value.toLowerCase().includes(lower);
    });
  }, [activeEntries, debouncedSearch]);

  const isDirty = useMemo(() => {
    if (!originalData) {
      return false;
    }
    return JSON.stringify(originalData) !== JSON.stringify(editableData);
  }, [editableData, originalData]);

  useDirtyState(isDirty, { when: isDirty });

  React.useEffect(() => {
    (async () => {
      try {
        const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
        const response = (await apiClient.api.get<Data>("/api/Admin")).data;
        setEditableData(response);
        setOriginalData(response);
      } catch (fetchError) {
        console.error("Error getting data:", fetchError);
        setError("Failed to load bot data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateValue = (key: string, value: string) => {
    setEditableData((prev) => {
      if (activeTab === "translations") {
        return {
          ...prev,
          translations: {
            ...prev.translations,
            [languageKey]: {
              ...prev.translations[languageKey],
              [key]: value,
            },
          },
        };
      }
      if (activeTab === "keyboardKeys") {
        return {
          ...prev,
          keyboardKeys: {
            ...prev.keyboardKeys,
            [key]: value,
          },
        };
      }
      return prev;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      await apiClient.api.post("/api/Admin", editableData);
      setOriginalData(editableData);
      addToast("Bot data saved", "success");
    } catch (saveError) {
      console.error("Error sending data:", saveError);
      setError("Error sending data to the server.");
      addToast("Failed to save changes", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(editableData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bot-data.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    try {
      const parsed = JSON.parse(text) as Data;
      setImportPreview(parsed);
      setIsImportModalOpen(true);
    } catch (parseError) {
      console.error("Import error", parseError);
      addToast("Invalid JSON file", "error");
    }
  };

  const applyImport = () => {
    if (importPreview) {
      setEditableData(importPreview);
      addToast("Import applied", "success");
    }
    setImportPreview(null);
    setIsImportModalOpen(false);
  };

  const handleCopyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      addToast("Key copied", "success");
    } catch (copyError) {
      console.error(copyError);
      addToast("Failed to copy key", "error");
    }
  };

  React.useEffect(() => {
    setPageTitle("Bot Data");
    setHeaderActions([
      {
        type: "button",
        id: "save-bot-data",
        label: saving ? "Saving..." : "Save all",
        variant: "primary",
        onClick: handleSave,
      },
      {
        type: "button",
        id: "export-bot-data",
        label: "Export JSON",
        variant: "outline",
        onClick: handleExport,
      },
      {
        type: "button",
        id: "import-bot-data",
        label: "Import JSON",
        variant: "outline",
        onClick: handleImportClick,
      },
    ]);
    return () => setHeaderActions([]);
  }, [handleExport, handleImportClick, handleSave, saving, setHeaderActions, setPageTitle]);

  const openDrawer = (item: EditorItem) => {
    setDrawerError(null);
    setIsExpandedEditor(false);
    setSelectedItem(item);
  };

  const updateDrawerValue = (value: string) => {
    if (!selectedItem) {
      return;
    }
    setSelectedItem({ ...selectedItem, value });
    setDrawerError(value.trim().length === 0 ? "Value cannot be empty." : null);
  };

  const saveDrawer = () => {
    if (!selectedItem) {
      return;
    }
    if (selectedItem.value.trim().length === 0) {
      setDrawerError("Value cannot be empty.");
      return;
    }
    updateValue(selectedItem.key, selectedItem.value);
    setSelectedItem(null);
  };

  const discardChanges = () => {
    if (originalData) {
      setEditableData(originalData);
    }
  };

  const updatedInfo = importPreview
    ? Object.keys(importPreview[activeTab === "translations" ? "translations" : "keyboardKeys"] ?? {}).length
    : 0;

  return (
    <div className="admin-grid">
      <PageHeader
        title="Bot data editor"
        description="Manage translations, keyboard keys, and message templates in one workspace."
        breadcrumbs={["Settings", "Bot", "Bot Data"]}
      />

      <Card>
        <div className="flex gap-3 flex-wrap">
          {["translations", "keyboardKeys", "templates"].map((tab) => (
            <button
              key={tab}
              className={`btn ${activeTab === tab ? "btn-primary" : "btn-outline"}`}
              onClick={() => setActiveTab(tab as typeof activeTab)}
            >
              {tab === "translations" && "Translations"}
              {tab === "keyboardKeys" && "Keyboard Keys"}
              {tab === "templates" && "Templates"}
            </button>
          ))}
        </div>
      </Card>

      {activeTab === "templates" ? (
        <EmptyState
          title="Templates coming soon"
          description="This section will host reusable bot message templates."
        />
      ) : (
        <Card>
          <div className="flex flex-wrap gap-3 justify-between">
            <div className="admin-topbar__search">
              <span>🔎</span>
              <input
                type="text"
                placeholder="Search by key or value..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <div className="text-sm text-gray-500">
                {filteredEntries.length} items
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                onChange={handleImportFile}
                className="hidden"
              />
            </div>
          </div>

          {loading && (
            <div className="mt-6 space-y-3">
              <div className="skeleton h-10" />
              <div className="skeleton h-10" />
              <div className="skeleton h-10" />
            </div>
          )}

          {!loading && filteredEntries.length === 0 && (
            <EmptyState
              title="No keys found"
              description="Try adjusting your search or import new data."
            />
          )}

          {!loading && filteredEntries.length > 0 && (
            <div className="mt-6 overflow-x-auto">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Value</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map(([key, value]) => {
                    const isShort = value.length < 80;
                    return (
                      <tr key={key}>
                        <td>
                          <div className="flex items-center gap-2">
                            <span>{key}</span>
                            <button
                              className="btn btn-outline"
                              onClick={() => handleCopyKey(key)}
                            >
                              Copy
                            </button>
                          </div>
                        </td>
                        <td>
                          {isShort ? (
                            <input
                              type="text"
                              value={value}
                              onChange={(event) => updateValue(key, event.target.value)}
                              className="w-full border border-gray-200 rounded-md px-3 py-2"
                            />
                          ) : (
                            <div className="admin-table__cell-truncate" title={value}>
                              {value}
                            </div>
                          )}
                        </td>
                        <td className="admin-table__cell-muted">—</td>
                        <td>
                          <button
                            className="btn btn-outline"
                            onClick={() => openDrawer({ key, value })}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {error && <div className="admin-empty">{error}</div>}

      <StickySaveBar
        isVisible={isDirty}
        onSave={handleSave}
        onCancel={discardChanges}
        isSaving={saving}
      />

      <Drawer
        isOpen={Boolean(selectedItem)}
        title="Edit item"
        onClose={() => setSelectedItem(null)}
      >
        {selectedItem && (
          <>
            <div>
              <label className="text-sm font-semibold">Key</label>
              <input
                type="text"
                value={selectedItem.key}
                readOnly
                className="w-full border border-gray-200 rounded-md px-3 py-2 mt-2 bg-gray-50"
              />
            </div>
            <div>
              <label className="text-sm font-semibold">Value</label>
              <textarea
                value={selectedItem.value}
                onChange={(event) => updateDrawerValue(event.target.value)}
                className={`w-full border border-gray-200 rounded-md px-3 py-2 mt-2 ${
                  isExpandedEditor ? "min-h-[260px]" : "min-h-[120px]"
                }`}
              />
              <button
                className="btn btn-outline mt-2"
                onClick={() => setIsExpandedEditor((prev) => !prev)}
                type="button"
              >
                {isExpandedEditor ? "Collapse editor" : "Expand editor"}
              </button>
              {drawerError && <small className="text-red-500">{drawerError}</small>}
            </div>
            <Card>
              <h4>Preview</h4>
              <p>{selectedItem.value || "—"}</p>
            </Card>
            <div className="flex gap-3 justify-end">
              <button className="btn btn-outline" onClick={() => setSelectedItem(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveDrawer}>
                Save
              </button>
            </div>
          </>
        )}
      </Drawer>

      <ModalConfirm
        isOpen={isImportModalOpen}
        title="Apply imported JSON?"
        description={`This will replace current data with ${updatedInfo} keys. Proceed?`}
        confirmLabel="Apply"
        onConfirm={applyImport}
        onCancel={() => {
          setImportPreview(null);
          setIsImportModalOpen(false);
        }}
      />
    </div>
  );
};

export default BotChangerPage;
