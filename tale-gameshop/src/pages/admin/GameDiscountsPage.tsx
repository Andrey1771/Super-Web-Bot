import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../../components/layout/PageHeader";
import Card from "../../components/ui/Card";
import { useToast } from "../../components/ui/ToastProvider";
import { useAdminHeader } from "../../components/layout/AdminHeaderContext";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IAdminGameDiscountsService } from "../../iterfaces/i-admin-game-discounts-service";
import type { IApiClient } from "../../iterfaces/i-api-client";
import type { IUrlService } from "../../iterfaces/i-url-service";
import type { AdminGameDiscountRow, GameDiscountStatus } from "../../types/admin-game-discounts";

// Конфиг баннера «Deal of the week» на главной: герой (его скидка = предложение) + кулисы.
type DealOfWeekConfig = {
  heroGameId?: string | null;
  wingGameIds: string[];
  maxWingGames: number;
  heroDealActive: boolean;
  heroDealEndsAt?: string | null;
  heroDealPercent?: number | null;
};

// «Карта удачи» (таро на главной): механика рандомного персонального промокода.
type TarotTier = { percent: number; weight: number };
type TarotAdminResponse = {
  settings: { enabled: boolean; cooldownHours: number; codeTtlHours: number; tiers: TarotTier[] };
  stats: { totalDraws: number; draws7d: number; redeemedInSample: number; sampleSize: number };
};

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

  // «Deal of the week»: герой + кулисы для баннера главной.
  const apiClient = useMemo(() => container.get<IApiClient>(IDENTIFIERS.IApiClient), []);
  const [dealHeroId, setDealHeroId] = useState<string>("");
  const [dealWingIds, setDealWingIds] = useState<string[]>([]);
  const [dealMaxWings, setDealMaxWings] = useState(6);
  const [dealStatus, setDealStatus] = useState<DealOfWeekConfig | null>(null);
  const [dealSaving, setDealSaving] = useState(false);

  const [tarotEnabled, setTarotEnabled] = useState(true);
  const [tarotCooldown, setTarotCooldown] = useState(24);
  const [tarotTtl, setTarotTtl] = useState(24);
  const [tarotTiers, setTarotTiers] = useState<TarotTier[]>([]);
  const [tarotStats, setTarotStats] = useState<TarotAdminResponse["stats"] | null>(null);
  const [tarotSaving, setTarotSaving] = useState(false);

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

  const loadDealOfWeek = useCallback(async () => {
    try {
      const response = await apiClient.api.get("/api/admin/deal-of-week");
      const config = response.data as DealOfWeekConfig;
      setDealHeroId(config.heroGameId ?? "");
      setDealWingIds(config.wingGameIds ?? []);
      setDealMaxWings(config.maxWingGames ?? 6);
      setDealStatus(config);
    } catch {
      addToast("Failed to load Deal of the week settings", "error");
    }
  }, [apiClient, addToast]);

  useEffect(() => {
    void loadDealOfWeek();
  }, [loadDealOfWeek]);

  const toggleDealWing = (gameId: string) => {
    setDealWingIds((prev) => {
      if (prev.includes(gameId)) {
        return prev.filter((id) => id !== gameId);
      }
      return prev.length >= dealMaxWings ? prev : [...prev, gameId];
    });
  };

  const saveDealOfWeek = async () => {
    setDealSaving(true);
    try {
      const response = await apiClient.api.put("/api/admin/deal-of-week", {
        heroGameId: dealHeroId || null,
        wingGameIds: dealWingIds
      });
      const config = response.data as DealOfWeekConfig;
      setDealHeroId(config.heroGameId ?? "");
      setDealWingIds(config.wingGameIds ?? []);
      setDealStatus(config);
      addToast("Deal of the week saved", "success");
    } catch (error: any) {
      addToast(error?.response?.data?.message ?? "Failed to save Deal of the week", "error");
    } finally {
      setDealSaving(false);
    }
  };

  // В герои предлагаем игры с активной скидкой — у остальных предложения просто нет.
  const activeDealRows = useMemo(() => items.filter((item) => item.status === "active"), [items]);

  const applyTarotResponse = useCallback((config: TarotAdminResponse) => {
    setTarotEnabled(config.settings.enabled);
    setTarotCooldown(config.settings.cooldownHours);
    setTarotTtl(config.settings.codeTtlHours);
    setTarotTiers(config.settings.tiers);
    setTarotStats(config.stats);
  }, []);

  const loadTarot = useCallback(async () => {
    try {
      const response = await apiClient.api.get("/api/admin/tarot");
      applyTarotResponse(response.data as TarotAdminResponse);
    } catch {
      addToast("Failed to load Lucky card settings", "error");
    }
  }, [apiClient, addToast, applyTarotResponse]);

  useEffect(() => {
    void loadTarot();
  }, [loadTarot]);

  const updateTarotTier = (index: number, patch: Partial<TarotTier>) => {
    setTarotTiers((prev) => prev.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)));
  };

  const saveTarot = async () => {
    setTarotSaving(true);
    try {
      const response = await apiClient.api.put("/api/admin/tarot", {
        enabled: tarotEnabled,
        cooldownHours: tarotCooldown,
        codeTtlHours: tarotTtl,
        tiers: tarotTiers
      });
      applyTarotResponse(response.data as TarotAdminResponse);
      addToast("Lucky card settings saved", "success");
    } catch (error: any) {
      addToast(error?.response?.data?.message ?? "Failed to save Lucky card settings", "error");
    } finally {
      setTarotSaving(false);
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
        <h3>Deal of the week — homepage banner</h3>
        <p className="text-sm text-gray-500" style={{ marginTop: 4 }}>
          The hero takes its price and countdown from its discount in the table below. Wing covers
          frame the banner edges (up to {dealMaxWings}).
        </p>
        <div className="admin-grid admin-grid--2" style={{ marginTop: 12 }}>
          <label>
            Hero game (limited offer)
            <select className="input" value={dealHeroId} onChange={(event) => setDealHeroId(event.target.value)}>
              <option value="">Auto — deepest active discount</option>
              {activeDealRows.map((row) => (
                <option key={row.gameId} value={row.gameId}>
                  {row.title} (−{Number(row.discountPercent ?? 0).toFixed(0)}%)
                </option>
              ))}
              {dealHeroId && !activeDealRows.some((row) => row.gameId === dealHeroId) && (
                <option value={dealHeroId}>
                  {items.find((row) => row.gameId === dealHeroId)?.title ?? "Unknown game"} (no active discount)
                </option>
              )}
            </select>
            {dealHeroId && dealStatus && !dealStatus.heroDealActive && (
              <small className="text-red-500">
                This game has no active discount — the banner will fall back to the deepest active
                deal. Set a discount in the table below.
              </small>
            )}
            {dealHeroId && dealStatus?.heroDealActive && dealStatus.heroDealEndsAt && (
              <small className="text-gray-500">
                Active −{Number(dealStatus.heroDealPercent ?? 0).toFixed(0)}% until{" "}
                {new Date(dealStatus.heroDealEndsAt).toLocaleString()}
              </small>
            )}
          </label>
          <div>
            <span className="text-sm font-semibold">
              Wing covers ({dealWingIds.length}/{dealMaxWings})
            </span>
            <div className="admin-grid admin-grid--2" style={{ maxHeight: 190, overflowY: "auto", marginTop: 6 }}>
              {items.map((row) => (
                <label key={row.gameId} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={dealWingIds.includes(row.gameId)}
                    disabled={
                      row.gameId === dealHeroId ||
                      (!dealWingIds.includes(row.gameId) && dealWingIds.length >= dealMaxWings)
                    }
                    onChange={() => toggleDealWing(row.gameId)}
                  />
                  <span>{row.title}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3">
          <button className="btn btn-primary" onClick={() => void saveDealOfWeek()} disabled={dealSaving}>
            {dealSaving ? "Saving..." : "Save deal of the week"}
          </button>
        </div>
      </Card>

      <Card>
        <h3>Lucky tarot card — random personal discount</h3>
        <p className="text-sm text-gray-500" style={{ marginTop: 4 }}>
          A signed-in visitor draws a card once per cooldown and gets a single-use promo code with a
          random percent (weighted tiers below). Codes go through the regular promo pipeline at checkout.
        </p>
        <div className="admin-grid admin-grid--4" style={{ marginTop: 12 }}>
          <label className="flex items-center gap-2" style={{ alignSelf: "end" }}>
            <input type="checkbox" checked={tarotEnabled} onChange={(event) => setTarotEnabled(event.target.checked)} />
            <span>Enabled</span>
          </label>
          <label>
            Cooldown (hours)
            <input
              className="input"
              type="number"
              min={1}
              value={tarotCooldown}
              onChange={(event) => setTarotCooldown(Number(event.target.value) || 1)}
            />
          </label>
          <label>
            Code lifetime (hours)
            <input
              className="input"
              type="number"
              min={1}
              value={tarotTtl}
              onChange={(event) => setTarotTtl(Number(event.target.value) || 1)}
            />
          </label>
          <div className="text-sm text-gray-500" style={{ alignSelf: "end" }}>
            {tarotStats
              ? `Draws: ${tarotStats.totalDraws} total · ${tarotStats.draws7d} last 7d · redeemed ${tarotStats.redeemedInSample}/${tarotStats.sampleSize} recent`
              : "Stats loading..."}
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <span className="text-sm font-semibold">Rarity tiers (percent / weight)</span>
          <div className="admin-grid admin-grid--3" style={{ marginTop: 6 }}>
            {tarotTiers.map((tier, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={99}
                  value={tier.percent}
                  onChange={(event) => updateTarotTier(index, { percent: Number(event.target.value) || 1 })}
                  title="Discount percent"
                />
                <span>% ·</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={tier.weight}
                  onChange={(event) => updateTarotTier(index, { weight: Number(event.target.value) || 1 })}
                  title="Roll weight"
                />
                <span className="text-sm text-gray-500">weight</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <button className="btn btn-primary" onClick={() => void saveTarot()} disabled={tarotSaving}>
            {tarotSaving ? "Saving..." : "Save lucky card"}
          </button>
        </div>
      </Card>

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
