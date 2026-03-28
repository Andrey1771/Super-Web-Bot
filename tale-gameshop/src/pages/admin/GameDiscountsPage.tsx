import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../../components/layout/PageHeader";
import Card from "../../components/ui/Card";
import { useToast } from "../../components/ui/ToastProvider";
import { useAdminHeader } from "../../components/layout/AdminHeaderContext";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IAdminGameDiscountsService } from "../../iterfaces/i-admin-game-discounts-service";
import type { IUrlService } from "../../iterfaces/i-url-service";
import type { AdminGameDiscountRow, GameDiscountStatus } from "../../types/admin-game-discounts";

type SortKey = "title" | "basePrice" | "finalPrice" | "discountPercent" | "endDate";

const statusLabels: Record<GameDiscountStatus, string> = {
  no_discount: "No discount",
  scheduled: "Scheduled",
  active: "Active",
  expired: "Expired"
};

const toDateInput = (iso?: string | null) => (iso ? iso.slice(0, 10) : new Date().toISOString().slice(0, 10));

const GameDiscountsPage: React.FC = () => {
  const service = container.get<IAdminGameDiscountsService>(IDENTIFIERS.IAdminGameDiscountsService);
  const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);
  const { addToast } = useToast();
  const { setHeaderActions, setPageTitle } = useAdminHeader();

  const [items, setItems] = useState<AdminGameDiscountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | GameDiscountStatus>("all");
  const [sortBy, setSortBy] = useState<SortKey>("title");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [editing, setEditing] = useState<AdminGameDiscountRow | null>(null);
  const [editPercent, setEditPercent] = useState<number>(10);
  const [editStartDate, setEditStartDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [editEndDate, setEditEndDate] = useState<string>(new Date().toISOString().slice(0, 10));

  const [bulkPercent, setBulkPercent] = useState<number>(10);
  const [bulkStartDate, setBulkStartDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [bulkEndDate, setBulkEndDate] = useState<string>(new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await service.getAll(search);
      setItems(response);
      setSelectedIds((prev) => prev.filter((id) => response.some((item) => item.gameId === id)));
    } catch {
      addToast("Failed to load game discounts", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast, search, service]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPageTitle("Game discounts");
    setHeaderActions([]);
    return () => setHeaderActions([]);
  }, [setHeaderActions, setPageTitle]);

  const filtered = useMemo(() => {
    const byStatus = statusFilter === "all" ? items : items.filter((item) => item.status === statusFilter);
    const sorted = [...byStatus];
    sorted.sort((a, b) => {
      if (sortBy === "title") {
        return a.title.localeCompare(b.title);
      }
      if (sortBy === "endDate") {
        return (a.endDate ? new Date(a.endDate).getTime() : Number.MAX_SAFE_INTEGER) -
          (b.endDate ? new Date(b.endDate).getTime() : Number.MAX_SAFE_INTEGER);
      }
      const left = Number(a[sortBy] ?? 0);
      const right = Number(b[sortBy] ?? 0);
      return right - left;
    });
    return sorted;
  }, [items, sortBy, statusFilter]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleSelection = (gameId: string) => {
    setSelectedIds((prev) => (prev.includes(gameId) ? prev.filter((id) => id !== gameId) : [...prev, gameId]));
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = filtered.map((item) => item.gameId);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const openEditor = (item: AdminGameDiscountRow) => {
    setEditing(item);
    setEditPercent(Number(item.discountPercent ?? 10));
    setEditStartDate(toDateInput(item.startDate));
    setEditEndDate(toDateInput(item.endDate));
  };

  const saveEditor = async () => {
    if (!editing) return;
    try {
      await service.upsert(editing.gameId, {
        discountPercent: editPercent,
        startDate: new Date(editStartDate).toISOString(),
        endDate: new Date(editEndDate).toISOString()
      });
      addToast("Discount saved", "success");
      setEditing(null);
      await load();
    } catch (error: any) {
      addToast(error?.response?.data ?? "Failed to save discount", "error");
    }
  };

  const clearDiscount = async (gameId: string) => {
    try {
      await service.remove(gameId);
      addToast("Discount cleared", "success");
      await load();
    } catch {
      addToast("Failed to clear discount", "error");
    }
  };

  const runBulkUpsert = async () => {
    if (selectedIds.length === 0) return;
    try {
      await service.bulkUpsert({
        gameIds: selectedIds,
        discountPercent: bulkPercent,
        startDate: new Date(bulkStartDate).toISOString(),
        endDate: new Date(bulkEndDate).toISOString()
      });
      addToast("Bulk discount applied", "success");
      await load();
    } catch (error: any) {
      addToast(error?.response?.data ?? "Failed to apply bulk discount", "error");
    }
  };

  const runBulkClear = async () => {
    if (selectedIds.length === 0) return;
    try {
      await service.bulkClear(selectedIds);
      addToast("Bulk clear completed", "success");
      await load();
    } catch {
      addToast("Failed to clear selected discounts", "error");
    }
  };

  return (
    <div className="admin-grid">
      <PageHeader title="Game discounts" description="Manage per-game discounts separately from promo codes." breadcrumbs={["Game discounts", "Admin"]} />

      <Card>
        <div className="flex gap-2 mb-4">
          <Link className="btn btn-outline" to="/admin/promo-codes">Promo Codes</Link>
          <Link className="btn btn-primary" to="/admin/game-discounts">Game Discounts</Link>
        </div>
        <div className="admin-grid admin-grid--4">
          <input className="input" placeholder="Search by title" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | GameDiscountStatus)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="scheduled">Scheduled</option>
            <option value="expired">Expired</option>
            <option value="no_discount">No discount</option>
          </select>
          <select className="input" value={sortBy} onChange={(event) => setSortBy(event.target.value as SortKey)}>
            <option value="title">Sort: title</option>
            <option value="basePrice">Sort: base price</option>
            <option value="finalPrice">Sort: final price</option>
            <option value="discountPercent">Sort: discount %</option>
            <option value="endDate">Sort: end date</option>
          </select>
          <button className="btn btn-outline" onClick={() => void load()}>Refresh</button>
        </div>
      </Card>

      <Card>
        <div className="admin-grid admin-grid--4" style={{ marginBottom: 12 }}>
          <div><strong>{selectedIds.length}</strong> selected</div>
          <input className="input" type="number" min={1} max={95} value={bulkPercent} onChange={(event) => setBulkPercent(Number(event.target.value))} placeholder="Bulk %" />
          <input className="input" type="date" value={bulkStartDate} onChange={(event) => setBulkStartDate(event.target.value)} />
          <input className="input" type="date" value={bulkEndDate} onChange={(event) => setBulkEndDate(event.target.value)} />
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => void runBulkUpsert()} disabled={selectedIds.length === 0}>Apply % discount to selected</button>
          <button className="btn btn-outline" onClick={() => void runBulkClear()} disabled={selectedIds.length === 0}>Clear selected discounts</button>
          <button className="btn btn-outline" onClick={toggleSelectAllVisible}>Toggle select visible</button>
        </div>
      </Card>

      <Card>
        {loading ? <p>Loading...</p> : (
          <table className="w-full text-sm">
            <thead>
            <tr>
              <th />
              <th>Cover</th>
              <th>Title</th>
              <th>Base price</th>
              <th>Discount type</th>
              <th>Discount value</th>
              <th>Final price</th>
              <th>Start date</th>
              <th>End date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
            </thead>
            <tbody>
            {filtered.map((item) => (
              <tr key={item.gameId}>
                <td><input type="checkbox" checked={selectedSet.has(item.gameId)} onChange={() => toggleSelection(item.gameId)} /></td>
                <td>
                  {item.imagePath ? (
                    <img
                      src={item.imagePath.startsWith("http") ? item.imagePath : `${urlService.apiBaseUrl}${item.imagePath}`}
                      alt={item.title}
                      width={52}
                      height={52}
                      style={{ borderRadius: 8, objectFit: "cover" }}
                    />
                  ) : "—"}
                </td>
                <td title={item.title}>{item.title}</td>
                <td>${Number(item.basePrice).toFixed(2)}</td>
                <td>{item.discountType ?? "—"}</td>
                <td>{item.discountPercent ? `${Number(item.discountPercent).toFixed(0)}%` : "—"}</td>
                <td>${Number(item.finalPrice).toFixed(2)}</td>
                <td>{item.startDate?.slice(0, 10) ?? "—"}</td>
                <td>{item.endDate?.slice(0, 10) ?? "—"}</td>
                <td>{statusLabels[item.status]}</td>
                <td>
                  <button className="btn btn-outline" onClick={() => openEditor(item)}>{item.discountPercent ? "Edit discount" : "Set discount"}</button>
                  {item.discountPercent && <button className="btn btn-outline" onClick={() => void clearDiscount(item.gameId)}>Clear</button>}
                </td>
              </tr>
            ))}
            </tbody>
          </table>
        )}
      </Card>

      {editing && (
        <div className="admin-modal" onClick={() => setEditing(null)}>
          <div className="admin-modal__card" onClick={(event) => event.stopPropagation()}>
            <h3>{editing.discountPercent ? "Edit discount" : "Set discount"} — {editing.title}</h3>
            <div className="admin-grid admin-grid--3">
              <select className="input" value="percentage" disabled>
                <option value="percentage">Percentage</option>
              </select>
              <input className="input" type="number" min={1} max={95} value={editPercent} onChange={(event) => setEditPercent(Number(event.target.value))} />
              <input className="input" type="date" value={editStartDate} onChange={(event) => setEditStartDate(event.target.value)} />
              <input className="input" type="date" value={editEndDate} onChange={(event) => setEditEndDate(event.target.value)} />
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn btn-primary" onClick={() => void saveEditor()}>Save</button>
              <button className="btn btn-outline" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameDiscountsPage;
