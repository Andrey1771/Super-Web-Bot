import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import container from "../../../inversify.config";
import type { IApiClient } from "../../../iterfaces/i-api-client";
import type { IUrlService } from "../../../iterfaces/i-url-service";
import IDENTIFIERS from "../../../constants/identifiers";
import { useDispatch, useSelector } from "react-redux";
import { Form } from "../../../store";
import GameTypeDropdown from "../game-type-dropdown/game-type-dropdown";
import PageHeader from "../../layout/PageHeader";
import { useAdminHeader } from "../../layout/AdminHeaderContext";
import Card from "../../ui/Card";
import Drawer from "../../ui/Drawer";
import ModalConfirm from "../../ui/ModalConfirm";
import EmptyState from "../../ui/EmptyState";
import useDebouncedValue from "../../../hooks/useDebouncedValue";
import { useDirtyState } from "../../../hooks/useDirtyState";
import { useToast } from "../../ui/ToastProvider";
import MediaPickerModal from "../media-library/MediaPickerModal";
import type { MediaAsset } from "../../../types/media";
import { slugify } from "../../../utils/slugify";
import { getKeyOverview } from "../../../api/adminKeysApi";

type DrawerMode = "edit" | "create" | null;

type GameItem = {
  id: string;
  name?: string;
  price?: number;
  description?: string;
  title?: string;
  gameType?: number;
  imagePath?: string;
  coverMediaId?: string;
  releaseDate?: string;
  isComingSoon?: boolean;
};

// Релиз наступает сам по дате — админ должен узнать о пустом пуле ДО этого дня, а не в него.
const NO_KEYS_WARNING =
  "Release happens automatically when the date arrives — with an empty key pool the game would go on sale without keys.";

const emptyForm: Form = {
  id: "",
  name: "",
  price: 0,
  description: "",
  title: "",
  gameType: 0,
  imagePath: "",
  coverMediaId: "",
  releaseDate: "",
};

const CardAdderPage: React.FC = () => {
  const [items, setItems] = useState<GameItem[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isDiscardOpen, setIsDiscardOpen] = useState(false);
  const [isRemoveMediaOpen, setIsRemoveMediaOpen] = useState(false);
  const [pendingRemoveTarget, setPendingRemoveTarget] = useState<"cover" | "legacy" | null>(null);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [saveErrorDetails, setSaveErrorDetails] = useState<string | null>(null);
  const [isSaveErrorOpen, setIsSaveErrorOpen] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<MediaAsset | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  // null = остатки ключей не загрузились; предупреждения в этом случае не показываем, чтобы не врать.
  const [availableKeysByGameId, setAvailableKeysByGameId] = useState<Record<string, number> | null>(null);
  const { addToast } = useToast();
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);
  const { setHeaderActions, setPageTitle } = useAdminHeader();
  const navigate = useNavigate();

  const form = useSelector((state: { form: Form }) => state.form);
  const dispatch = useDispatch();

  const debouncedSearch = useDebouncedValue(search, 300);

  React.useEffect(() => {
    fetchItems(page, true);
  }, [page]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const overview = await getKeyOverview();
        if (!cancelled) {
          setAvailableKeysByGameId(
            Object.fromEntries(overview.games.map((row) => [row.gameId, row.available]))
          );
        }
      } catch (error) {
        console.error("Failed to load key stock overview", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);


  React.useEffect(() => {
    if (drawerOpen) {
      nameInputRef.current?.focus();
    }
  }, [drawerOpen, drawerMode]);

  React.useEffect(() => {
    if (!drawerOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleDrawerClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen]);

  React.useEffect(() => {
    if (!drawerOpen) {
      return;
    }
    if (!form.coverMediaId) {
      setSelectedMedia(null);
      return;
    }
    fetchMediaDetails(form.coverMediaId, true);
  }, [drawerOpen, form.coverMediaId]);

  const fetchItems = async (pageNumber: number, reset = false) => {
    try {
      setListLoading(true);
      setListError(null);
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      const response = await apiClient.api.get(`/api/game?page=${pageNumber}&limit=20`);
      const newItems = response.data as GameItem[];

      setItems((prev) => (reset ? newItems : [...prev, ...newItems]));
      if (newItems.length < 20) {
        setHasMore(false);
      }
      setListLoading(false);
      return newItems;
    } catch (error) {
      console.error("Error loading objects:", error);
      setListError("Failed to load games.");
    }
    setListLoading(false);
    return [];
  };

  const filteredItems = useMemo(() => {
    if (!debouncedSearch) {
      return items;
    }
    const lower = debouncedSearch.toLowerCase();
    return items.filter((item) => (item.name ?? "").toLowerCase().includes(lower));
  }, [debouncedSearch, items]);

  const isDirty = useMemo(() => {
    if (!drawerOpen) {
      return false;
    }
    if (drawerMode === "create") {
      return Boolean(form.name || form.description || form.title || form.imagePath || form.coverMediaId);
    }
    if (!selectedGame) {
      return false;
    }
    return (
      form.name !== (selectedGame.name ?? "") ||
      form.description !== (selectedGame.description ?? "") ||
      form.title !== (selectedGame.title ?? "") ||
      Number(form.price) !== Number(selectedGame.price ?? 0) ||
      Number(form.gameType) !== Number(selectedGame.gameType ?? 0) ||
      (form.releaseDate ?? "") !== (selectedGame.releaseDate?.split("T")[0] ?? "") ||
      form.imagePath !== (selectedGame.imagePath ?? "") ||
      form.coverMediaId !== (selectedGame.coverMediaId ?? "")
    );
  }, [drawerOpen, drawerMode, form, selectedGame]);

  useDirtyState(isDirty, { when: isDirty });

  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!form.name?.trim()) {
      errors.name = "Name is required.";
    }
    if (!form.title?.trim()) {
      errors.title = "Title is required.";
    }
    if (Number.isNaN(Number(form.price)) || Number(form.price) < 0) {
      errors.price = "Price must be a number greater than or equal to 0.";
    }
    if (form.description && form.description.length > 500) {
      errors.description = "Description must be 500 characters or fewer.";
    }
    return errors;
  }, [form.description, form.name, form.price, form.title]);

  const isFormValid = Object.keys(validationErrors).length === 0;

  const formatPrice = (price: number | undefined) => {
    const value = typeof price === "number" ? price : 0;
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(value);
  };

  const getLegacyFileName = (path: string) => {
    if (!path) {
      return "";
    }
    const normalized = path.replace(/\\/g, "/");
    return normalized.split("/").pop() ?? "";
  };

  const getLegacyRelativeUrl = (path: string) => {
    const fileName = getLegacyFileName(path);
    if (!fileName) {
      return "";
    }
    return `/uploads/${fileName}`;
  };

  const getLegacyPreviewUrl = (path: string) => {
    const relative = getLegacyRelativeUrl(path);
    if (!relative) {
      return "";
    }
    return `${urlService.apiBaseUrl}${relative}`;
  };

  const fetchMediaDetails = async (mediaId: string, silent = false) => {
    if (!mediaId) {
      setSelectedMedia(null);
      return;
    }
    try {
      if (!silent) {
        setMediaLoading(true);
      }
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      const response = await apiClient.api.get(`/api/media/${mediaId}`);
      setSelectedMedia(response.data as MediaAsset);
    } catch (error) {
      console.error("Failed to load media details", error);
      setSelectedMedia(null);
    } finally {
      if (!silent) {
        setMediaLoading(false);
      }
    }
  };

  const importLegacyMedia = async () => {
    if (!form.imagePath) {
      return;
    }
    try {
      setMediaLoading(true);
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      const response = await apiClient.api.post("/api/media/import", {
        relativeUrl: getLegacyRelativeUrl(form.imagePath),
        contentType: "image",
      });
      const asset = response.data as MediaAsset;
      setSelectedMedia(asset);
      dispatch({
        type: "SET_GAME_TYPE_FORM",
        payload: { ...form, coverMediaId: asset.id },
      });
      addToast("Legacy image imported to library.", "success");
    } catch (error) {
      console.error("Failed to import legacy media", error);
      addToast("Failed to import legacy image.", "error");
    } finally {
      setMediaLoading(false);
    }
  };
  const applyFormFromGame = (item: GameItem) => {
    dispatch({
      type: "SET_GAME_TYPE_FORM",
      payload: {
        id: item.id || "",
        name: item.name || "",
        price: item.price || 0,
        description: item.description || "",
        title: item.title || "",
        gameType: item.gameType || 0,
        imagePath: item.imagePath || "",
        coverMediaId: item.coverMediaId || "",
        releaseDate: item.releaseDate ? item.releaseDate.split("T")[0] : "",
      },
    });
  };

  const resetForm = useCallback(() => {
    dispatch({
      type: "SET_GAME_TYPE_FORM",
      payload: emptyForm,
    });
    setSelectedMedia(null);
  }, [dispatch]);

  const handleSelectGame = (item: GameItem) => {
    setIsDetailsLoading(true);
    setSelectedGameId(item.id);
    setSelectedGame(item);
    applyFormFromGame(item);
    if (item.coverMediaId) {
      fetchMediaDetails(item.coverMediaId);
    } else {
      setSelectedMedia(null);
    }
    const isMobile = window.innerWidth < 1024;
    if (isMobile) {
      setDetailsDrawerOpen(true);
    }
    setTimeout(() => setIsDetailsLoading(false), 150);
  };

  const handleEditGame = (item: GameItem) => {
    handleSelectGame(item);
    setDetailsDrawerOpen(false);
    navigate(`/admin/games/details?gameId=${item.id}`);
  };

  const handleCreateGame = useCallback(() => {
    resetForm();
    setDrawerMode("create");
    setDrawerOpen(true);
    setDetailsDrawerOpen(false);
  }, [resetForm]);

  React.useEffect(() => {
    setPageTitle("Catalog");
    setHeaderActions([
      {
        type: "button",
        id: "create-game",
        label: "+ Add",
        variant: "primary",
        onClick: handleCreateGame,
      },
    ]);
    return () => setHeaderActions([]);
  }, [handleCreateGame, setHeaderActions, setPageTitle]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    dispatch({
      type: "SET_GAME_TYPE_FORM",
      payload: {
        ...form,
        [name]: name === "price" || name === "gameType" ? Number(value) : value,
      },
    });
  };

  const buildPayload = (payload: Form) => {
    const normalizedTitle = (payload.title ?? "").trim();
    const normalizedName = (payload.name ?? "").trim();
    const slugSource = normalizedTitle || normalizedName || "game";
    const generatedSlug = slugify(slugSource);
    const generatedExternalId = `web-${generatedSlug}-${Date.now().toString(36)}`;
    const generatedId = Array.from(crypto.getRandomValues(new Uint8Array(12)))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    const resolvedImagePath = (payload.imagePath ?? "").trim() || selectedMedia?.url || "";

    const cleaned: Record<string, unknown> = {
      ...payload,
      id: payload.id || generatedId,
      price: payload.price ? Number(payload.price) : 0,
      gameType: payload.gameType ? Number(payload.gameType) : 0,
      imagePath: resolvedImagePath,
      slug: generatedSlug,
      externalId: generatedExternalId,
    };

    if (!payload.releaseDate) {
      delete cleaned.releaseDate;
    }
    if (!payload.coverMediaId) {
      delete cleaned.coverMediaId;
    }
    if (!payload.description) {
      delete cleaned.description;
    }
    return cleaned;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!drawerMode) {
      return;
    }
    if (!isFormValid) {
      addToast("Fix validation errors before saving.", "error");
      return;
    }
    setSaving(true);
    const updatedItem = {
      ...form,
    };

    try {
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      let createdId: string | null = null;
      const payload = buildPayload(updatedItem);

      if (drawerMode === "create") {
        const response = await apiClient.api.post("/api/game", payload);
        createdId = response.data?.id ?? response.data?.gameId ?? null;
      }

      setPage(1);
      setHasMore(true);
      setItems([]);
      const refreshedItems = await fetchItems(1, true);

      const targetId = drawerMode === "create" ? createdId ?? updatedItem.id : selectedGame?.id;
      const refreshedSelection = refreshedItems.find((item) => item.id === targetId);
      if (refreshedSelection) {
        setSelectedGameId(refreshedSelection.id);
        setSelectedGame(refreshedSelection);
        applyFormFromGame(refreshedSelection);
      }

      const wasCreate = drawerMode === "create";
      setDrawerOpen(false);
      setDrawerMode(null);
      resetForm();
      setDetailsDrawerOpen(false);
      // Сбрасываем «грязное» состояние формы ДО любой навигации, иначе guard из useDirtyState
      // перехватит programmatic navigate и покажет «You have unsaved changes».
      if (wasCreate && createdId) {
        // Вместо мгновенного перехода — notify-плашка с кнопкой перехода и прогресс-баром.
        addToast("Игра создана", "success", {
          action: {
            label: "Перейти к редактированию",
            onClick: () => navigate(`/admin/games/details?gameId=${createdId}`),
          },
        });
      } else {
        addToast(wasCreate ? "Game created" : "Changes saved", "success");
      }
    } catch (error) {
      console.error("Error saving object:", error);
      const message =
        (error as any)?.response?.data?.message ||
        (error as any)?.response?.data?.error ||
        (error as Error)?.message ||
        "Failed to save.";
      setSaveErrorDetails(String(message));
      setIsSaveErrorOpen(true);
      addToast("Failed to save. See details.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDrawerClose = () => {
    if (isDirty) {
      setIsDiscardOpen(true);
      return;
    }
    setDrawerOpen(false);
    setDrawerMode(null);
    resetForm();
  };

  const handleDiscardChanges = () => {
    setIsDiscardOpen(false);
    setDrawerOpen(false);
    setDrawerMode(null);
    resetForm();
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 10 && hasMore) {
      setPage((prev) => prev + 1);
    }
  };

  const requestDelete = (itemId: string) => {
    setPendingDeleteId(itemId);
    const item = items.find((game) => game.id === itemId);
    setPendingDeleteName(item?.name ?? "Unnamed");
    setIsDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!pendingDeleteId) {
      return;
    }
    try {
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      await apiClient.api.delete(`/api/game/${pendingDeleteId}`);
      setItems((prev) => prev.filter((item) => item.id !== pendingDeleteId));
      if (selectedGameId === pendingDeleteId) {
        const remaining = items.filter((item) => item.id !== pendingDeleteId);
        const nextGame = remaining[0] ?? null;
        setSelectedGameId(nextGame?.id ?? null);
        setSelectedGame(nextGame);
      }
      addToast("Object deleted", "success");
    } catch (error) {
      console.error("Object deletion error:", error);
      addToast("Failed to delete", "error");
    } finally {
      setIsDeleteOpen(false);
      setPendingDeleteId(null);
      setPendingDeleteName(null);
      await fetchItems(1, true);
    }
  };

  const handleClearSearch = () => setSearch("");

  const handleOpenMediaPicker = () => setMediaPickerOpen(true);

  const handleSelectMedia = (asset: MediaAsset) => {
    setSelectedMedia(asset);
    dispatch({
      type: "SET_GAME_TYPE_FORM",
      payload: { ...form, coverMediaId: asset.id },
    });
  };

  const handleRequestRemove = (target: "cover" | "legacy") => {
    setPendingRemoveTarget(target);
    setIsRemoveMediaOpen(true);
  };

  const handleConfirmRemove = () => {
    if (pendingRemoveTarget === "cover") {
      setSelectedMedia(null);
      dispatch({
        type: "SET_GAME_TYPE_FORM",
        payload: { ...form, coverMediaId: "" },
      });
    }
    if (pendingRemoveTarget === "legacy") {
      dispatch({
        type: "SET_GAME_TYPE_FORM",
        payload: { ...form, imagePath: "" },
      });
    }
    setIsRemoveMediaOpen(false);
    setPendingRemoveTarget(null);
  };

  // Статус релиза приходит с сервера (isComingSoon в DTO) — клиент даты не сравнивает.
  // withNote — развёрнутая строка для карточки «Date» в панели деталей.
  const renderReleaseStatus = (item: GameItem, withNote = false) => {
    if (!item.isComingSoon) {
      return null;
    }
    const availableKeys = availableKeysByGameId ? availableKeysByGameId[item.id] ?? 0 : null;
    return (
      <>
        <span className="admin-release-pills">
          <span className="admin-release-pill">Coming soon</span>
          {availableKeys === 0 && (
            <span className="admin-release-pill admin-release-pill--warn" title={NO_KEYS_WARNING}>
              No keys yet
            </span>
          )}
        </span>
        {withNote && (
          <p className="admin-release-note">
            Goes on sale automatically on the release date
            {availableKeys === 0 ? " — add keys to the pool before it arrives." : "."}
          </p>
        )}
      </>
    );
  };

  const drawerTitle = drawerMode === "create" ? "Create game" : "Edit game";

  return (
    <div className="admin-grid">
      <PageHeader
        title="Catalog editor"
        description="Create, update, and organize game cards using a structured master–detail layout."
        breadcrumbs={["Games", "Catalog"]}
      />

      <div className="admin-grid admin-grid--2">
        <Card>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="admin-topbar__search">
              <span>🔎</span>
              <input
                type="text"
                placeholder="Search games..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && (
                <button className="btn btn-outline" onClick={handleClearSearch}>
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 h-[420px] overflow-y-auto" onScroll={handleScroll}>
            {listLoading ? (
              <div className="space-y-3">
                <div className="skeleton h-10" />
                <div className="skeleton h-10" />
                <div className="skeleton h-10" />
              </div>
            ) : listError ? (
              <EmptyState
                title="Unable to load games"
                description={listError}
                action={
                  <button className="btn btn-primary" onClick={() => fetchItems(1, true)}>
                    Retry
                  </button>
                }
              />
            ) : filteredItems.length === 0 ? (
              <EmptyState
                title="No games yet"
                description="Create your first game entry to populate the catalog."
                action={
                  <button className="btn btn-primary" onClick={handleCreateGame}>
                    Create first item
                  </button>
                }
              />
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Price</th>
                    <th>Type</th>
                    <th>Release date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      className={item.id === selectedGameId ? "admin-table__row-selected" : ""}
                    >
                      <td>
                        <button className="text-left" onClick={() => handleSelectGame(item)}>
                          <strong title={item.name || "Unnamed"} className="admin-table__cell-truncate">
                            {item.name || "Unnamed"}
                          </strong>
                          {renderReleaseStatus(item)}
                          <div className="admin-table__cell-muted admin-table__cell-truncate" title={item.title}>
                            {item.title}
                          </div>
                        </button>
                      </td>
                      <td>{formatPrice(item.price)}</td>
                      <td className="admin-table__cell-muted">{item.gameType ?? "—"}</td>
                      <td className="admin-table__cell-muted">{item.releaseDate?.split("T")[0] ?? "—"}</td>
                      <td>
                        <div className="flex gap-2">
                          <button className="btn btn-outline" onClick={() => handleEditGame(item)}>
                            Edit
                          </button>
                          <button className="btn btn-outline" onClick={() => requestDelete(item.id)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!hasMore && filteredItems.length > 0 && (
              <p className="text-center mt-4 muted">No more objects.</p>
            )}
          </div>
        </Card>

        <Card className="hidden lg:block">
          {isDetailsLoading ? (
            <div className="space-y-3">
              <div className="skeleton h-10" />
              <div className="skeleton h-20" />
              <div className="skeleton h-20" />
            </div>
          ) : selectedGame ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3>{selectedGame.name || "Unnamed"}</h3>
                <div className="flex gap-2">
                  <button className="btn btn-outline" onClick={() => handleEditGame(selectedGame)}>
                    Edit
                  </button>
                  <button className="btn btn-outline" onClick={() => requestDelete(selectedGame.id)}>
                    Delete
                  </button>
                </div>
              </div>

              <Card>
                <h3>Basic info</h3>
                <p><strong>Name:</strong> {selectedGame.name || "—"}</p>
                <p><strong>Title:</strong> {selectedGame.title || "—"}</p>
              </Card>

              <Card>
                <h3>Content</h3>
                <p>{selectedGame.description || "—"}</p>
              </Card>

              <Card>
                <h3>Action settings</h3>
                <p><strong>Price:</strong> {formatPrice(selectedGame.price)}</p>
                <p><strong>Game type:</strong> {selectedGame.gameType ?? "—"}</p>
              </Card>

              <Card>
                <h3>Date</h3>
                <p>{selectedGame.releaseDate?.split("T")[0] ?? "—"}</p>
                {renderReleaseStatus(selectedGame, true)}
              </Card>

              <Card>
                <h3>Media</h3>
                {selectedGame.coverMediaId ? (
                  selectedMedia ? (
                    <div className="flex items-center gap-3">
                      <img src={selectedMedia.url} alt={selectedMedia.filename} className="h-12 w-12 rounded object-cover" />
                      <div>
                        <p className="text-sm font-semibold">{selectedMedia.filename}</p>
                        <p className="text-xs text-gray-500">Linked media</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Loading media preview...</p>
                  )
                ) : selectedGame.imagePath ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={getLegacyPreviewUrl(selectedGame.imagePath)}
                      alt="Legacy"
                      className="h-12 w-12 rounded object-cover"
                    />
                    <div>
                      <p className="text-sm font-semibold">{getLegacyFileName(selectedGame.imagePath)}</p>
                      <p className="text-xs text-gray-500">Legacy image</p>
                    </div>
                  </div>
                ) : (
                  <p>—</p>
                )}
              </Card>
            </div>
          ) : (
            <EmptyState
              title="Select a game to view details"
              description="Choose a game from the list to see its details here."
              action={
                <button className="btn btn-primary" onClick={handleCreateGame}>
                  Create game
                </button>
              }
            />
          )}
        </Card>
      </div>

      <Drawer
        isOpen={drawerOpen}
        title={drawerTitle}
        onClose={handleDrawerClose}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Card>
            <h3>Basic info</h3>
            <label className="text-sm font-semibold">Name</label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              className="w-full p-2 border rounded"
              ref={nameInputRef}
            />
            {validationErrors.name && <small className="text-red-500">{validationErrors.name}</small>}
            <label className="text-sm font-semibold">Title</label>
            <input
              type="text"
              name="title"
              value={form.title}
              onChange={handleChange}
              className="w-full p-2 border rounded"
            />
            {validationErrors.title && <small className="text-red-500">{validationErrors.title}</small>}
          </Card>

          <Card>
            <h3>Content</h3>
            <label className="text-sm font-semibold">Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.stopPropagation();
                }
              }}
              className="w-full p-2 border rounded min-h-[120px]"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>{form.description?.length ?? 0} / 500</span>
              {validationErrors.description && <span className="text-red-500">{validationErrors.description}</span>}
            </div>
          </Card>

          <Card>
            <h3>Action settings</h3>
            <label className="text-sm font-semibold">Price</label>
            <input
              type="number"
              name="price"
              value={form.price}
              onChange={handleChange}
              className="w-full p-2 border rounded"
            />
            {validationErrors.price && <small className="text-red-500">{validationErrors.price}</small>}
            <label className="text-sm font-semibold">Game type</label>
            <GameTypeDropdown />
          </Card>

          <Card>
            <h3>Date</h3>
            <label className="text-sm font-semibold">Release date</label>
            <input
              type="date"
              name="releaseDate"
              value={form.releaseDate.split("T")[0]}
              onChange={handleChange}
              className="w-full p-2 border rounded"
            />
          </Card>

          <Card>
            <h3>Media</h3>
            {form.coverMediaId && selectedMedia ? (
              <div className="space-y-3">
                <div className="h-36 w-full overflow-hidden rounded border">
                  <img src={selectedMedia.url} alt={selectedMedia.filename} className="h-full w-full object-cover" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{selectedMedia.filename}</p>
                    <p className="text-xs text-gray-500">Media ID: {selectedMedia.id}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-outline" onClick={handleOpenMediaPicker}>
                      Change
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => handleRequestRemove("cover")}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : form.imagePath ? (
              <div className="space-y-3">
                <div className="h-36 w-full overflow-hidden rounded border">
                  <img src={getLegacyPreviewUrl(form.imagePath)} alt="Legacy cover" className="h-full w-full object-cover" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Legacy image</p>
                    <p className="text-xs text-gray-500">{getLegacyFileName(form.imagePath)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-outline" onClick={importLegacyMedia} disabled={mediaLoading}>
                      {mediaLoading ? "Importing..." : "Import to library"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => handleRequestRemove("legacy")}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="h-36 w-full rounded border border-dashed flex items-center justify-center text-sm text-gray-500">
                  No cover selected yet.
                </div>
                <button type="button" className="btn btn-primary" onClick={handleOpenMediaPicker}>
                  Select image
                </button>
              </div>
            )}
          </Card>

          <div className="admin-drawer__footer">
            <button type="button" className="btn btn-outline" onClick={handleDrawerClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || !isFormValid}>
              {saving
                ? "Saving..."
                : drawerMode === "create"
                  ? "Create game"
                  : "Save changes"}
            </button>
          </div>
        </form>
      </Drawer>

      <Drawer
        isOpen={detailsDrawerOpen && !drawerOpen}
        title="Game details"
        onClose={() => setDetailsDrawerOpen(false)}
      >
        {selectedGame ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3>{selectedGame.name || "Unnamed"}</h3>
              <div className="flex gap-2">
                <button className="btn btn-outline" onClick={() => handleEditGame(selectedGame)}>
                  Edit
                </button>
                <button className="btn btn-outline" onClick={() => requestDelete(selectedGame.id)}>
                  Delete
                </button>
              </div>
            </div>
            <Card>
              <h3>Basic info</h3>
              <p><strong>Name:</strong> {selectedGame.name || "—"}</p>
              <p><strong>Title:</strong> {selectedGame.title || "—"}</p>
            </Card>
            <Card>
              <h3>Content</h3>
              <p>{selectedGame.description || "—"}</p>
            </Card>
            <Card>
              <h3>Action settings</h3>
              <p><strong>Price:</strong> {formatPrice(selectedGame.price)}</p>
              <p><strong>Game type:</strong> {selectedGame.gameType ?? "—"}</p>
            </Card>
            <Card>
              <h3>Date</h3>
              <p>{selectedGame.releaseDate?.split("T")[0] ?? "—"}</p>
            </Card>
            <Card>
              <h3>Media</h3>
              {selectedGame.coverMediaId ? (
                selectedMedia ? (
                  <div className="flex items-center gap-3">
                    <img src={selectedMedia.url} alt={selectedMedia.filename} className="h-12 w-12 rounded object-cover" />
                    <div>
                      <p className="text-sm font-semibold">{selectedMedia.filename}</p>
                      <p className="text-xs text-gray-500">Linked media</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Loading media preview...</p>
                )
              ) : selectedGame.imagePath ? (
                <div className="flex items-center gap-3">
                  <img
                    src={getLegacyPreviewUrl(selectedGame.imagePath)}
                    alt="Legacy"
                    className="h-12 w-12 rounded object-cover"
                  />
                  <div>
                    <p className="text-sm font-semibold">{getLegacyFileName(selectedGame.imagePath)}</p>
                    <p className="text-xs text-gray-500">Legacy image</p>
                  </div>
                </div>
              ) : (
                <p>—</p>
              )}
            </Card>
          </div>
        ) : (
          <EmptyState
            title="Select a game to view details"
            description="Choose a game from the list to see its details here."
            action={
              <button className="btn btn-primary" onClick={handleCreateGame}>
                Create game
              </button>
            }
          />
        )}
      </Drawer>

      <MediaPickerModal
        isOpen={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelect={handleSelectMedia}
        initialSelectedId={form.coverMediaId || undefined}
        filterType="image"
      />

      <ModalConfirm
        isOpen={isDiscardOpen}
        title="Discard changes?"
        description="You have unsaved changes. Discard them?"
        confirmLabel="Discard"
        onConfirm={handleDiscardChanges}
        onCancel={() => setIsDiscardOpen(false)}
      />

      <ModalConfirm
        isOpen={isDeleteOpen}
        title={`Delete game “${pendingDeleteName ?? "Unnamed"}”?`}
        description="Это действие необратимо."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => {
          setIsDeleteOpen(false);
          setPendingDeleteName(null);
        }}
      />

      <ModalConfirm
        isOpen={isRemoveMediaOpen}
        title={pendingRemoveTarget === "legacy" ? "Remove legacy image?" : "Remove cover image?"}
        description="This will clear the selected image from the game."
        confirmLabel="Remove"
        onConfirm={handleConfirmRemove}
        onCancel={() => {
          setIsRemoveMediaOpen(false);
          setPendingRemoveTarget(null);
        }}
      />

      <ModalConfirm
        isOpen={isSaveErrorOpen}
        title="Save failed"
        description={saveErrorDetails ?? "Unexpected error."}
        confirmLabel="Close"
        onConfirm={() => setIsSaveErrorOpen(false)}
        onCancel={() => setIsSaveErrorOpen(false)}
      />
    </div>
  );
};

export default CardAdderPage;
