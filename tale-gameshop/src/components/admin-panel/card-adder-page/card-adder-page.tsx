import React, { useMemo, useState } from "react";
import container from "../../../inversify.config";
import type { IApiClient } from "../../../iterfaces/i-api-client";
import IDENTIFIERS from "../../../constants/identifiers";
import { useDispatch, useSelector } from "react-redux";
import { Form } from "../../../store";
import GameTypeDropdown from "../game-type-dropdown/game-type-dropdown";
import PageHeader from "../../layout/PageHeader";
import Card from "../../ui/Card";
import Drawer from "../../ui/Drawer";
import ModalConfirm from "../../ui/ModalConfirm";
import StickySaveBar from "../../ui/StickySaveBar";
import EmptyState from "../../ui/EmptyState";
import useDebouncedValue from "../../../hooks/useDebouncedValue";
import { useDirtyState } from "../../../hooks/useDirtyState";
import { useToast } from "../../ui/ToastProvider";

const CardAdderPage: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [mode, setMode] = useState<"add" | "edit">("edit");
  const [file, setFile] = useState<File | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const { addToast } = useToast();

  const form = useSelector((state: { form: Form }) => state.form);
  const dispatch = useDispatch();

  const debouncedSearch = useDebouncedValue(search, 300);

  React.useEffect(() => {
    fetchItems(page, true);
  }, [page]);

  const fetchItems = async (pageNumber: number, reset = false) => {
    try {
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      const response = await apiClient.api.get(`/api/game?page=${pageNumber}&limit=20`);
      const newItems = response.data;

      setItems((prev) => (reset ? newItems : [...prev, ...newItems]));
      if (newItems.length < 20) {
        setHasMore(false);
      }
    } catch (error) {
      console.error("Error loading objects:", error);
    }
  };

  const filteredItems = useMemo(() => {
    if (!debouncedSearch) {
      return items;
    }
    const lower = debouncedSearch.toLowerCase();
    return items.filter((item) =>
      (item.name ?? "").toLowerCase().includes(lower)
    );
  }, [debouncedSearch, items]);

  const isDirty = useMemo(() => {
    if (mode === "add") {
      return Boolean(form.name || form.description || form.title || form.imagePath);
    }
    if (!selectedItem) {
      return false;
    }
    return (
      form.name !== (selectedItem.name ?? "") ||
      form.description !== (selectedItem.description ?? "") ||
      form.title !== (selectedItem.title ?? "") ||
      Number(form.price) !== Number(selectedItem.price ?? 0) ||
      Number(form.gameType) !== Number(selectedItem.gameType ?? 0) ||
      (form.releaseDate ?? "") !== (selectedItem.releaseDate?.split("T")[0] ?? "") ||
      form.imagePath !== (selectedItem.imagePath ?? "")
    );
  }, [form, mode, selectedItem]);

  useDirtyState(isDirty, { when: isDirty });

  const handleSelect = (item: any) => {
    setSelectedItem(item);
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
        releaseDate: item.releaseDate ? item.releaseDate.split("T")[0] : "",
      },
    });
    setMode("edit");
    setDetailOpen(true);
  };

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

  const uploadImage = async () => {
    if (!file) {
      return form.imagePath;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      const response = await apiClient.api.post("/api/image/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return getFilePath(response.data.filePath);
    } catch (error) {
      console.error("Error loading image:", error);
      return form.imagePath;
    }
  };

  const getFilePath = (fullPath: string) => {
    const fileName = fullPath.split("\\").pop();
    return `wwwroot\\uploads\\${fileName}`;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const imagePath = await uploadImage();

    const updatedItem = {
      ...form,
      price: form.price ? Number(form.price) : 0,
      gameType: form.gameType ? Number(form.gameType) : 0,
      imagePath,
    };

    try {
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      if (mode === "edit") {
        await apiClient.api.put(`/api/game/${selectedItem.id}`, updatedItem);
      } else {
        await apiClient.api.post("/api/game", updatedItem);
      }
      setPage(1);
      setHasMore(true);
      setItems([]);
      await fetchItems(1, true);
      resetForm();
      addToast("Changes saved", "success");
    } catch (error) {
      console.error("Error saving object:", error);
      addToast("Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAction = () => {
    void handleSubmit({ preventDefault: () => undefined } as React.FormEvent);
  };

  const resetForm = () => {
    setSelectedItem(null);
    dispatch({
      type: "SET_GAME_TYPE_FORM",
      payload: {
        id: "",
        name: "",
        price: 0,
        description: "",
        title: "",
        gameType: 0,
        imagePath: "",
        releaseDate: "",
      },
    });
    setFile(null);
    setMode("edit");
    setDetailOpen(false);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 10 && hasMore) {
      setPage((prev) => prev + 1);
    }
  };

  const requestDelete = (itemId: string) => {
    setPendingDeleteId(itemId);
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
      resetForm();
      addToast("Object deleted", "success");
    } catch (error) {
      console.error("Object deletion error:", error);
      addToast("Failed to delete", "error");
    } finally {
      setIsDeleteOpen(false);
      setPendingDeleteId(null);
      await fetchItems(1, true);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      dispatch({
        type: "SET_GAME_TYPE_FORM",
        payload: {
          ...form,
          imagePath: e.target.files[0].name ?? "",
        },
      });
    }
  };

  return (
    <div className="admin-grid">
      <PageHeader
        title="Catalog editor"
        description="Create, update, and organize game cards using a structured master–detail layout."
        breadcrumbs={["Games", "Catalog"]}
        primaryAction={
          <button
            className="btn btn-primary"
            onClick={() => {
              resetForm();
              setMode("add");
              setDetailOpen(true);
            }}
          >
            + Add new
          </button>
        }
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
            </div>
            <button
              className="btn btn-outline"
              onClick={() => {
                resetForm();
                setMode("add");
                setDetailOpen(true);
              }}
            >
              Add new
            </button>
          </div>

          <div className="mt-4 h-[420px] overflow-y-auto" onScroll={handleScroll}>
            {filteredItems.length === 0 ? (
              <EmptyState
                title="No games yet"
                description="Create your first game entry to populate the catalog."
                action={
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      resetForm();
                      setMode("add");
                      setDetailOpen(true);
                    }}
                  >
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
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item: any) => (
                    <tr key={item.id}>
                      <td>
                        <button
                          className="text-left"
                          onClick={() => handleSelect(item)}
                        >
                          <strong>{item.name || "Unnamed"}</strong>
                          <div className="admin-table__cell-muted">{item.title}</div>
                        </button>
                      </td>
                      <td>{item.price ?? 0} ₽</td>
                      <td>
                        <div className="flex gap-2">
                          <button className="btn btn-outline" onClick={() => handleSelect(item)}>
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
          {mode === "edit" && !selectedItem ? (
            <EmptyState
              title="Select an object to edit"
              description="Pick a game from the list to see its details."
            />
          ) : (
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
                />
                <label className="text-sm font-semibold">Title</label>
                <input
                  type="text"
                  name="title"
                  value={form.title}
                  onChange={handleChange}
                  className="w-full p-2 border rounded"
                />
              </Card>

              <Card>
                <h3>Content</h3>
                <label className="text-sm font-semibold">Description</label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  className="w-full p-2 border rounded min-h-[120px]"
                />
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
                <input type="file" onChange={handleFileChange} className="input" />
                {form.imagePath && (
                  <p className="mt-2 text-gray-600">
                    Current file: {form.imagePath.split("\\").pop()}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: "SET_GAME_TYPE_FORM",
                      payload: { ...form, imagePath: "" },
                    })
                  }
                  className="btn btn-outline mt-2"
                >
                  Clear file
                </button>
              </Card>

              <StickySaveBar
                isVisible={isDirty}
                onSave={handleSaveAction}
                onCancel={resetForm}
                isSaving={saving}
              />
            </form>
          )}
        </Card>
      </div>

      <Drawer
        isOpen={detailOpen && (mode === "add" || Boolean(selectedItem))}
        title="Edit game"
        onClose={() => setDetailOpen(false)}
      >
        {mode === "edit" && !selectedItem ? (
          <EmptyState
            title="Select an object to edit"
            description="Pick a game from the list to see its details."
          />
        ) : (
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
              />
              <label className="text-sm font-semibold">Title</label>
              <input
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                className="w-full p-2 border rounded"
              />
            </Card>

            <Card>
              <h3>Content</h3>
              <label className="text-sm font-semibold">Description</label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                className="w-full p-2 border rounded min-h-[120px]"
              />
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
              <input type="file" onChange={handleFileChange} className="input" />
              {form.imagePath && (
                <p className="mt-2 text-gray-600">
                  Current file: {form.imagePath.split("\\").pop()}
                </p>
              )}
              <button
                type="button"
                onClick={() =>
                  dispatch({
                    type: "SET_GAME_TYPE_FORM",
                    payload: { ...form, imagePath: "" },
                  })
                }
                className="btn btn-outline mt-2"
              >
                Clear file
              </button>
            </Card>

            <StickySaveBar
              isVisible={isDirty}
              onSave={handleSaveAction}
              onCancel={resetForm}
              isSaving={saving}
            />
          </form>
        )}
      </Drawer>

      <ModalConfirm
        isOpen={isDeleteOpen}
        title="Delete this item?"
        description="Это действие необратимо. Удалить объект?"
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setIsDeleteOpen(false)}
      />
    </div>
  );
};

export default CardAdderPage;
