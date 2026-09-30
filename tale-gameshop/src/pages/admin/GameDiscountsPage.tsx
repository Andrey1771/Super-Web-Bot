import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { REMOTE_PAGING_AND_SORTING } from "../../hooks/use-grid-window";
import "devextreme/dist/css/dx.light.css";
import { DataGrid } from "devextreme-react";
import { Column, Scrolling, Selection, Sorting } from "devextreme-react/data-grid";
import CustomStore from "devextreme/data/custom_store";
import PageHeader, { GAMES_TABS } from "../../components/layout/PageHeader";
import Card from "../../components/ui/Card";
import { useToast } from "../../components/ui/ToastProvider";
import { useAdminHeader } from "../../components/layout/AdminHeaderContext";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IAdminGameDiscountsService } from "../../iterfaces/i-admin-game-discounts-service";
import type { IApiClient } from "../../iterfaces/i-api-client";
import type { IUrlService } from "../../iterfaces/i-url-service";
import type { AdminGameDiscountRow, GameDiscountStatus } from "../../types/admin-game-discounts";
import { useSitePreferences } from "../../context/site-preferences";
import { formatMoney } from "../../utils/format-money";

// Конфиг баннера «Deal of the week» на главной: герой (его скидка = предложение) + кулисы.
type DealGame = { gameId: string; title: string | null };

type DealOfWeekConfig = {
  heroGameId?: string | null;
  /** Название выбранного героя приходит с сервера: искать его в каталоге пришлось бы целиком. */
  heroTitle?: string | null;
  wingGameIds: string[];
  /** Выбранные крылья с названиями — чтобы показать выбор, не выкачивая каталог. */
  wings?: DealGame[];
  maxWingGames: number;
  heroDealActive: boolean;
  heroDealEndsAt?: string | null;
  heroDealPercent?: number | null;
};

/** Сколько строк показывать в поиске игр для баннера. Больше человек всё равно не просмотрит. */
const PICKER_LIMIT = 20;

// «Карта удачи» (таро на главной): механика рандомного персонального промокода.
type TarotTier = { percent: number; weight: number };
type TarotAdminResponse = {
  settings: { enabled: boolean; requirePurchase: boolean; cooldownHours: number; codeTtlHours: number; tiers: TarotTier[] };
  stats: { totalDraws: number; draws7d: number; redeemedInSample: number; sampleSize: number };
};

const statusLabels: Record<GameDiscountStatus, string> = {
  no_discount: "No discount",
  scheduled: "Scheduled",
  active: "Active",
  expired: "Expired"
};

const toDateInput = (iso?: string | null) => (iso ? iso.slice(0, 10) : new Date().toISOString().slice(0, 10));

const GameDiscountsPage: React.FC = () => {
  const { baseCurrency } = useSitePreferences();
  const service = container.get<IAdminGameDiscountsService>(IDENTIFIERS.IAdminGameDiscountsService);
  const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);
  const { addToast } = useToast();
  const { setPageTitle } = useAdminHeader();

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | GameDiscountStatus>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [editing, setEditing] = useState<AdminGameDiscountRow | null>(null);
  const [editPercent, setEditPercent] = useState<number>(10);
  const [editStartDate, setEditStartDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [editEndDate, setEditEndDate] = useState<string>(new Date().toISOString().slice(0, 10));

  const [bulkPercent, setBulkPercent] = useState<number>(10);
  const [bulkStartDate, setBulkStartDate] = useState<string>(new Date().toISOString().slice(0, 10));
  // Конец периода — неделя вперёд. С «сегодня — сегодня» скидка применялась уже истёкшей:
  // конец периода — это полночь текущего дня, то есть момент, который уже прошёл.
  const [bulkEndDate, setBulkEndDate] = useState<string>(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );

  // «Deal of the week»: герой + кулисы для баннера главной.
  const apiClient = useMemo(() => container.get<IApiClient>(IDENTIFIERS.IApiClient), []);
  const [dealHeroId, setDealHeroId] = useState<string>("");
  const [dealHeroTitle, setDealHeroTitle] = useState<string | null>(null);
  /** Крылья храним вместе с названиями: выбранное должно быть видно и без поиска. */
  const [dealWings, setDealWings] = useState<DealGame[]>([]);
  const [heroSearch, setHeroSearch] = useState("");
  const [heroOptions, setHeroOptions] = useState<AdminGameDiscountRow[]>([]);
  const [heroTotal, setHeroTotal] = useState(0);
  const [wingSearch, setWingSearch] = useState("");
  const [wingOptions, setWingOptions] = useState<AdminGameDiscountRow[]>([]);
  const [wingTotal, setWingTotal] = useState(0);
  const [dealMaxWings, setDealMaxWings] = useState(6);
  const [dealStatus, setDealStatus] = useState<DealOfWeekConfig | null>(null);
  const [dealSaving, setDealSaving] = useState(false);

  const [tarotEnabled, setTarotEnabled] = useState(true);
  const [tarotRequirePurchase, setTarotRequirePurchase] = useState(true);
  const [tarotCooldown, setTarotCooldown] = useState(24);
  const [tarotTtl, setTarotTtl] = useState(24);
  const [tarotTiers, setTarotTiers] = useState<TarotTier[]>([]);
  const [tarotStats, setTarotStats] = useState<TarotAdminResponse["stats"] | null>(null);
  const [tarotSaving, setTarotSaving] = useState(false);

  // Сколько строк тянуть за раз. Виртуальная прокрутка запрашивает окна по мере движения,
  // так что размер влияет только на частоту запросов, а не на объём в памяти.
  const WINDOW_SIZE = 50;

/** Колонка грида → поле, по которому сортирует сервер. */
const SORT_FIELDS: Record<string, string> = {
  title: "title",
  basePrice: "basePrice",
  discountPercent: "discountPercent",
  finalPrice: "finalPrice",
  startDate: "period",
  status: "status",
};

  // Что реально ушло в таблицу: набранное в поиске уезжает с задержкой, а не на каждую букву.
  const [appliedSearch, setAppliedSearch] = useState("");
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  /**
   * Источник строк для таблицы. Поиск, срез по статусу, сортировка и границы окна уходят
   * на сервер — в браузер приезжает только то, что видно. Раньше сюда грузился весь каталог,
   * и на большом магазине страница просто не открылась бы.
   */
  const gridSource = useMemo(() => {
    const status = statusFilter;
    const needle = appliedSearch;

    return new CustomStore({
      key: "gameId",
      load: async (options: { skip?: number; take?: number; sort?: any }) => {
        // Сортировка приходит от грида в его формате и уходит на сервер: он считает и
        // скидку, и итоговую цену, и статус прямо в базе. Сортировать здесь, в браузере,
        // значило бы упорядочить полсотни загруженных строк и выдать это за порядок каталога.
        const sort = Array.isArray(options.sort) ? options.sort[0] : options.sort;
        const sortBy = SORT_FIELDS[sort?.selector as string] ?? "title";

        const page = await service.getPage({
          search: needle,
          status,
          sortBy,
          desc: Boolean(sort?.desc),
          skip: options.skip ?? 0,
          take: options.take ?? WINDOW_SIZE,
        });

        setRowCount(page.total);
        return { data: page.items, totalCount: page.total };
      },
    });
  }, [appliedSearch, service, statusFilter, reloadTick]);

  const load = useCallback(async () => {
    // Перезагрузка таблицы: пересобираем источник, грид сам заберёт первое окно.
    setSelectedIds([]);
    setReloadTick((tick) => tick + 1);
  }, []);

  /**
   * Игры для баннера ищет сервер. Раньше сюда грузились «первые двести по названию», и на
   * каталоге в тридцать тысяч это значило, что всё остальное выбрать нельзя — молча.
   *
   * Герой ищется среди игр с действующей скидкой: баннер берёт у него цену и обратный отсчёт,
   * и игра без скидки героем быть не может.
   */
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const page = await service.getPage({ search: heroSearch.trim(), status: "active", skip: 0, take: PICKER_LIMIT });
        if (!cancelled) {
          setHeroOptions(page.items);
          setHeroTotal(page.total);
        }
      } catch {
        if (!cancelled) {
          setHeroOptions([]);
          setHeroTotal(0);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [heroSearch, service]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const page = await service.getPage({ search: wingSearch.trim(), skip: 0, take: PICKER_LIMIT });
        if (!cancelled) {
          setWingOptions(page.items);
          setWingTotal(page.total);
        }
      } catch {
        if (!cancelled) {
          setWingOptions([]);
          setWingTotal(0);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [wingSearch, service]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPageTitle("Game discounts");
  }, [setPageTitle]);

  // Выделение ведёт сам грид (галки в строках и в шапке), поэтому своих переключателей
  // здесь больше нет: раньше «Toggle select visible» означало «выделить весь каталог»,
  // потому что видимым был он целиком.

  /** Конфиг приходит с названиями выбранных игр — раскладываем его по состоянию. */
  const applyDealConfig = useCallback((config: DealOfWeekConfig) => {
    setDealHeroId(config.heroGameId ?? "");
    setDealHeroTitle(config.heroTitle ?? null);
    setDealWings(
      config.wings ?? (config.wingGameIds ?? []).map((gameId) => ({ gameId, title: null })),
    );
    setDealStatus(config);
  }, []);

  const loadDealOfWeek = useCallback(async () => {
    try {
      const response = await apiClient.api.get("/api/admin/deal-of-week");
      const config = response.data as DealOfWeekConfig;
      applyDealConfig(config);
      setDealMaxWings(config.maxWingGames ?? 6);
    } catch {
      addToast("Failed to load Deal of the week settings", "error");
    }
  }, [apiClient, addToast]);

  useEffect(() => {
    void loadDealOfWeek();
  }, [loadDealOfWeek]);

  const toggleDealWing = (game: DealGame) => {
    setDealWings((prev) => {
      if (prev.some((wing) => wing.gameId === game.gameId)) {
        return prev.filter((wing) => wing.gameId !== game.gameId);
      }
      return prev.length >= dealMaxWings ? prev : [...prev, game];
    });
  };

  const wingSelected = (gameId: string) => dealWings.some((wing) => wing.gameId === gameId);

  const saveDealOfWeek = async () => {
    setDealSaving(true);
    try {
      const response = await apiClient.api.put("/api/admin/deal-of-week", {
        heroGameId: dealHeroId || null,
        wingGameIds: dealWings.map((wing) => wing.gameId)
      });
      applyDealConfig(response.data as DealOfWeekConfig);
      addToast("Deal of the week saved", "success");
    } catch (error: any) {
      addToast(error?.response?.data?.message ?? "Failed to save Deal of the week", "error");
    } finally {
      setDealSaving(false);
    }
  };

  // В герои предлагаем игры с активной скидкой — у остальных предложения просто нет.
  const applyTarotResponse = useCallback((config: TarotAdminResponse) => {
    setTarotEnabled(config.settings.enabled);
    setTarotRequirePurchase(config.settings.requirePurchase);
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
        requirePurchase: tarotRequirePurchase,
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
      <PageHeader title="Prices & discounts" description="Per-game discounts and the deal of the week. Promo codes live on their own tab." breadcrumbs={["Marketing", "Discounts"]} tabs={GAMES_TABS} />

      <Card>
        <h3>Deal of the week — homepage banner</h3>
        <p className="text-sm text-gray-500" style={{ marginTop: 4 }}>
          The hero takes its price and countdown from its discount in the table below. Wing covers
          frame the banner edges (up to {dealMaxWings}).
        </p>
        {/* Две колонки одного устройства: подпись, выбранное, поиск, результаты, счётчик.
            Строки везде одной высоты — иначе поля и списки слева и справа разъезжаются по
            вертикали, и блок выглядит как два разных, случайно оказавшихся рядом. */}
        <div className="admin-grid admin-grid--2 deal-picker-row" style={{ marginTop: 12 }}>
          <div className="deal-picker">
            <span className="deal-picker__label">Hero game (limited offer)</span>

            <div className="deal-picker__current">
              {dealHeroId ? (
                <>
                  <span className="bulk-bar__count">{dealHeroTitle ?? "Game not in the catalog"}</span>
                  <button className="btn btn-outline" onClick={() => { setDealHeroId(""); setDealHeroTitle(null); }}>
                    Clear
                  </button>
                </>
              ) : (
                <span className="deal-picker__muted">Auto — deepest active discount</span>
              )}
            </div>

            {/* Ищет сервер: раньше выпадающий список показывал игры из первых двухсот по
                названию, и на большом каталоге остальные было просто не выбрать. */}
            <input
              className="input"
              placeholder="Find a game with an active discount…"
              value={heroSearch}
              onChange={(event) => setHeroSearch(event.target.value)}
            />

            <div className="deal-picker__results">
              {heroOptions.length === 0 ? (
                <p className="deal-picker__muted" style={{ padding: 8 }}>
                  {heroSearch.trim() ? "Nothing found with an active discount." : "No active discounts yet."}
                </p>
              ) : (
                heroOptions.map((row) => (
                  <button
                    key={row.gameId}
                    type="button"
                    className="deal-picker__option"
                    onClick={() => {
                      setDealHeroId(row.gameId);
                      setDealHeroTitle(row.title);
                    }}
                  >
                    {row.title} (−{Number(row.discountPercent ?? 0).toFixed(0)}%)
                  </button>
                ))
              )}
            </div>

            <p className="deal-picker__hint">
              {heroTotal > heroOptions.length
                ? `Showing ${heroOptions.length} of ${heroTotal} — keep typing to narrow it down.`
                : ""}
            </p>

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
          </div>

          <div className="deal-picker">
            <span className="deal-picker__label">
              Wing covers ({dealWings.length}/{dealMaxWings})
            </span>

            {/* Выбранное показываем отдельно и всегда: иначе снять галку можно было бы только
                с того, что нашлось поиском, — а найти нужно ещё суметь. */}
            <div className="deal-picker__current">
              {dealWings.length === 0 ? (
                <span className="deal-picker__muted">Auto — the newest released games</span>
              ) : (
                dealWings.map((wing) => (
                  <span key={wing.gameId} className="bulk-bar__count deal-picker__chip">
                    {wing.title ?? "Game not in the catalog"}
                    <button type="button" title="Remove from the banner" onClick={() => toggleDealWing(wing)}>
                      ✕
                    </button>
                  </span>
                ))
              )}
            </div>

            <input
              className="input"
              placeholder="Find a game…"
              value={wingSearch}
              onChange={(event) => setWingSearch(event.target.value)}
            />

            <div className="deal-picker__results deal-picker__results--two-columns">
              {wingOptions.length === 0 ? (
                <p className="deal-picker__muted" style={{ padding: 8 }}>Nothing found.</p>
              ) : (
                wingOptions.map((row) => (
                  <label key={row.gameId} className="deal-picker__check">
                    <input
                      type="checkbox"
                      checked={wingSelected(row.gameId)}
                      disabled={
                        row.gameId === dealHeroId ||
                        (!wingSelected(row.gameId) && dealWings.length >= dealMaxWings)
                      }
                      onChange={() => toggleDealWing({ gameId: row.gameId, title: row.title })}
                    />
                    <span>{row.title}</span>
                  </label>
                ))
              )}
            </div>

            <p className="deal-picker__hint">
              {wingTotal > wingOptions.length
                ? `Showing ${wingOptions.length} of ${wingTotal} — keep typing to narrow it down.`
                : ""}
            </p>
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
          <div style={{ alignSelf: "end" }}>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={tarotEnabled} onChange={(event) => setTarotEnabled(event.target.checked)} />
              <span>Enabled</span>
            </label>
            <label className="flex items-center gap-2" title="Blocks multi-account farming: a new account is free, a purchase is not">
              <input
                type="checkbox"
                checked={tarotRequirePurchase}
                onChange={(event) => setTarotRequirePurchase(event.target.checked)}
              />
              <span>Buyers only</span>
            </label>
          </div>
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

      {/* Поиск, фильтр и массовые действия — часть таблицы, а не отдельные карточки над ней:
          они ничего не значат без строк, к которым относятся. */}
      <Card>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            className="input w-full sm:w-64"
            placeholder="Search by title"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="input w-full sm:w-48"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | GameDiscountStatus)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="scheduled">Scheduled</option>
            <option value="expired">Expired</option>
            <option value="no_discount">No discount</option>
          </select>
          <span className="text-xs text-gray-500">
            Tick rows to set a discount on several games at once.
          </span>
          <button className="btn btn-outline ml-auto" onClick={() => void load()}>Refresh</button>
        </div>

        {/* Панель массовых действий появляется только при непустом выделении: постоянная
            строка отключённых кнопок над таблицей отвлекала бы в обычной работе. */}
        {selectedIds.length > 0 && (
          <div className="bulk-bar" style={{ marginBottom: 16 }}>
            <span className="bulk-bar__count">{selectedIds.length} selected</span>

            <label className="bulk-bar__percent">
              Discount
              <input
                className="input"
                type="number"
                min={1}
                max={95}
                value={bulkPercent}
                onChange={(event) => setBulkPercent(Number(event.target.value))}
              />
              %
            </label>

            <label className="bulk-bar__field">
              from
              <input className="input" type="date" value={bulkStartDate} onChange={(event) => setBulkStartDate(event.target.value)} />
            </label>

            <label className="bulk-bar__field">
              to
              <input className="input" type="date" value={bulkEndDate} onChange={(event) => setBulkEndDate(event.target.value)} />
            </label>

            <button
              className="btn btn-primary"
              onClick={() => {
                if (window.confirm(`Apply ${bulkPercent}% discount to ${selectedIds.length} game(s)?`)) {
                  void runBulkUpsert();
                }
              }}
            >
              Apply to selected
            </button>
            <button
              className="btn btn-outline"
              onClick={() => {
                if (window.confirm(`Clear discounts on ${selectedIds.length} game(s)?`)) {
                  void runBulkClear();
                }
              }}
            >
              Clear discounts
            </button>
            <button className="btn btn-outline" onClick={() => setSelectedIds([])}>
              Clear selection
            </button>
          </div>
        )}

        {/* Таблица DevExtreme с виртуальной прокруткой: в DOM живут только видимые строки,
            а сами строки приезжают окнами с сервера (см. gridSource). Раньше здесь была своя
            <table>, рисовавшая ВЕСЬ каталог разом. */}
        <DataGrid
          dataSource={gridSource}
          height={560}
          width="100%"
          showBorders={false}
          columnAutoWidth={true}
          hoverStateEnabled={true}
          remoteOperations={REMOTE_PAGING_AND_SORTING}
          noDataText={appliedSearch ? "Nothing found." : "No games yet."}
          selectedRowKeys={selectedIds}
          onSelectionChanged={(event) => setSelectedIds(event.selectedRowKeys as string[])}
        >
          <Scrolling mode="virtual" rowRenderingMode="virtual" showScrollbar="always" />
          {/* Выделение — только по загруженным строкам: галка в шапке не должна означать
              «весь магазин», иначе одно нажатие меняет цены тридцати тысячам игр. */}
          <Selection mode="multiple" showCheckBoxesMode="always" selectAllMode="page" />
          {/* Сортировать умеем по тем полям, которые сервер сортирует в базе. Остальные
              колонки не кликаются: сортировка загруженного куска врала бы. */}
          <Sorting mode="single" />

          <Column
            caption="Cover"
            /* Обложка и кнопки не сортируются: упорядочивать картинку или пару кнопок не по чему. */
            width={80}
            allowSorting={false}
            cellRender={({ data }: { data: AdminGameDiscountRow }) =>
              data.imagePath ? (
                <img
                  src={data.imagePath.startsWith("http") ? data.imagePath : `${urlService.apiBaseUrl}${data.imagePath}`}
                  alt={data.title}
                  width={44}
                  height={44}
                  style={{ borderRadius: 8, objectFit: "cover" }}
                />
              ) : (
                <span>—</span>
              )
            }
          />
          <Column dataField="title" caption="Title" allowSorting={true} />
          <Column
            dataField="basePrice"
            caption="Base price"
            width={110}
            allowSorting={true}
            cellRender={({ data }: { data: AdminGameDiscountRow }) => (
              <span>{formatMoney(Number(data.basePrice), baseCurrency)}</span>
            )}
          />
          <Column
            dataField="discountPercent"
            caption="Discount"
            width={110}
            allowSorting={true}
            cellRender={({ data }: { data: AdminGameDiscountRow }) => (
              <span>{data.discountPercent ? `${Number(data.discountPercent).toFixed(0)}%` : "—"}</span>
            )}
          />
          <Column
            dataField="finalPrice"
            caption="Final price"
            width={110}
            allowSorting={true}
            cellRender={({ data }: { data: AdminGameDiscountRow }) => (
              <span>{formatMoney(Number(data.finalPrice), baseCurrency)}</span>
            )}
          />
          <Column
            dataField="startDate"
            caption="Period"
            width={190}
            allowSorting={true}
            cellRender={({ data }: { data: AdminGameDiscountRow }) => (
              <span>
                {data.startDate ? data.startDate.slice(0, 10) : "—"} — {data.endDate ? data.endDate.slice(0, 10) : "—"}
              </span>
            )}
          />
          <Column
            dataField="status"
            caption="Status"
            width={110}
            allowSorting={true}
            cellRender={({ data }: { data: AdminGameDiscountRow }) => <span>{statusLabels[data.status]}</span>}
          />
          <Column
            caption="Actions"
            width={190}
            allowSorting={false}
            cellRender={({ data }: { data: AdminGameDiscountRow }) => (
              <div className="flex gap-2">
                <button className="btn btn-outline" onClick={() => openEditor(data)}>
                  {data.discountPercent ? "Edit" : "Set discount"}
                </button>
                {data.discountPercent ? (
                  <button className="btn btn-outline" onClick={() => void clearDiscount(data.gameId)}>
                    Clear
                  </button>
                ) : null}
              </div>
            )}
          />
        </DataGrid>

        <p className="text-xs text-gray-500 mt-3">
          {rowCount === null ? "Loading…" : `${rowCount} game${rowCount === 1 ? "" : "s"} match the filters`}
        </p>
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
