import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import container from "../../../inversify.config";
import type { IApiClient } from "../../../iterfaces/i-api-client";
import type { IUrlService } from "../../../iterfaces/i-url-service";
import IDENTIFIERS from "../../../constants/identifiers";
import { useDispatch, useSelector } from "react-redux";
import { Form } from "../../../store";
import { buildAdminCatalogParams } from "./admin-catalog-params";
import PageHeader, { GAMES_TABS } from "../../layout/PageHeader";
import { useSitePreferences } from "../../../context/site-preferences";
import { formatMoney } from "../../../utils/format-money";
import { useAdminHeader } from "../../layout/AdminHeaderContext";
import Card from "../../ui/Card";
import CoverFocusEditor from "../cover-focus/CoverFocusEditor";
import { DataGrid, Column, Paging, Scrolling, Sorting } from "../../grid";
import { GRID_PAGE_SIZE, REMOTE_PAGING, gridStatusText, useGridWindow } from "../../../hooks/use-grid-window";
import { fetchWindow } from "../../../utils/page-window";
import Drawer from "../../ui/Drawer";
import ModalConfirm from "../../ui/ModalConfirm";
import EmptyState from "../../ui/EmptyState";
import useDebouncedValue from "../../../hooks/useDebouncedValue";
import { useDirtyState } from "../../../hooks/useDirtyState";
import { useToast } from "../../ui/ToastProvider";
import MediaPickerModal from "../media-library/MediaPickerModal";
import type { MediaAsset } from "../../../types/media";
import { slugify } from "../../../utils/slugify";
import LocalizedField from "../../admin/LocalizedField";
import { getKeyOverview } from "../../../api/adminKeysApi";
import { getCardCompletenessOverview } from "../../../api/adminCompletenessApi";
import { getGamePrices } from "../../../api/adminPricesApi";
import type { IAdminGameDetailsService } from "../../../iterfaces/i-admin-game-details-service";
import { getAdminSoftwareCategories, type AdminSoftwareCategory } from "../../../api/adminSoftwareApi";
import SoftwareCategoriesEditor from "../../admin/SoftwareCategoriesEditor";
import GameGenresEditor from "../../admin/GameGenresEditor";
import { getAdminGenres, type AdminGenre } from "../../../api/adminGenresApi";

type DrawerMode = "edit" | "create" | null;

type GameItem = {
  id: string;
  name?: string;
  price?: number;
  /** Ручные цены по валютам; в базовой валюте цена лежит в price. */
  prices?: Record<string, number>;
  description?: string;
  /** Переводы описания (ru/uk/pl); description — английское. */
  descriptionI18n?: Record<string, string>;
  title?: string;
  gameType?: number;
  imagePath?: string;
  coverMediaId?: string;
  releaseDate?: string;
  isComingSoon?: boolean;
  /** Для DLC — id базовой игры. */
  parentGameId?: string | null;
  /** Игра или ПО и категория раздела /software. */
  kind?: "Game" | "Software";
  softwareCategory?: string | null;
  /** Черновик: на витрине не виден. Список админки просит каталог вместе с черновиками (includeDrafts). */
  isDraft?: boolean;
  /** Название жанра по настройкам — то, что видит покупатель. */
  category?: string;
  /** Код жанра игры — значение поля «Genre» в форме. */
  genre?: string | null;
};

// Релиз наступает сам по дате — админ должен узнать о пустом пуле ДО этого дня, а не в него.
// Размер страницы каталога. Список подгружается прокруткой, поэтому важно не столько
// число, сколько то, что оно вообще соблюдается: прежний запрос слал limit, который
// сервер игнорировал, и в браузер приезжал весь каталог целиком.

const NO_KEYS_WARNING =
  "Release happens automatically when the date arrives — with an empty key pool the game would go on sale without keys.";

const emptyForm: Form = {
  id: "",
  name: "",
  price: 0,
  prices: {},
  description: "",
  title: "",
  gameType: 0,
  imagePath: "",
  coverMediaId: "",
  releaseDate: "",
  parentGameId: "",
  kind: "Game",
  softwareCategory: "",
  genre: "",
};

const CardAdderPage: React.FC = () => {
  const { baseCurrency, currencies } = useSitePreferences();
  // Валюты сверх базовой: цена в базовой живёт в отдельном поле, дублировать её в таблице
  // означало бы держать одно число в двух местах.
  const extraCurrencies = currencies
    .map((option) => option.code)
    .filter((code) => code !== baseCurrency);
  // Строки, которые таблица уже подтянула. Нужны не для отрисовки — её делает грид, — а
  // тому, что смотрит на список рядом: выделение пачкой, выбор после сохранения, удаление.
  const [items, setItems] = useState<GameItem[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Вид товара в списке: тот же kind, что у каталога витрины (all | game | software).
  const [kindFilter, setKindFilter] = useState<"all" | "game" | "software">("all");
  // Публикация в списке: все, только опубликованные или только черновики.
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");
  // Как создать товар: черновиком (по умолчанию) или сразу опубликованным. Черновик не виден в магазине, пока его
  // не опубликуют в редакторе карточки, — раньше новый товар попадал на витрину без описания, обложки и ключей.
  const [createAsDraft, setCreateAsDraft] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  // Массовые операции. Выделение живёт по id и переживает подгрузку следующих страниц,
  // но сбрасывается при смене поиска: иначе легко применить скидку к тому, чего не видишь.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPercent, setBulkPercent] = useState(20);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<null | "apply" | "remove">(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isDiscardOpen, setIsDiscardOpen] = useState(false);
  const [isRemoveMediaOpen, setIsRemoveMediaOpen] = useState(false);
  const [pendingRemoveTarget, setPendingRemoveTarget] = useState<"cover" | "legacy" | null>(null);
  const [saveErrorDetails, setSaveErrorDetails] = useState<string | null>(null);
  const [isSaveErrorOpen, setIsSaveErrorOpen] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<MediaAsset | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  // null = остатки ключей не загрузились; предупреждения в этом случае не показываем, чтобы не врать.
  const [availableKeysByGameId, setAvailableKeysByGameId] = useState<Record<string, number> | null>(null);
  // Категории раздела /software — для формы создания ПО, подписи в списке и редактора категорий.
  const [softwareCategories, setSoftwareCategories] = useState<AdminSoftwareCategory[]>([]);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  // Жанры игр — список из настроек, правится кнопкой «Game genres». Раньше их двенадцать были вшиты в выпадающий список.
  const [genres, setGenres] = useState<AdminGenre[]>([]);
  const [genresOpen, setGenresOpen] = useState(false);
  useEffect(() => {
    getAdminGenres()
      .then(setGenres)
      .catch((error) => console.error("Failed to load game genres", error));
  }, []);
  useEffect(() => {
    getAdminSoftwareCategories()
      .then(setSoftwareCategories)
      .catch((error) => console.error("Failed to load software categories", error));
  }, []);
  const categoryTitle = (tag?: string | null) => softwareCategories.find((category) => category.tag === tag)?.title ?? tag ?? "";
  const { addToast } = useToast();
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);
  const { setPageTitle } = useAdminHeader();
  const navigate = useNavigate();

  const form = useSelector((state: { form: Form }) => state.form);
  const dispatch = useDispatch();

  const debouncedSearch = useDebouncedValue(search, 300);

  // Новый поиск — новая выдача: выделение сбрасываем, иначе скидка ушла бы тем строкам,
  // которых уже не видно.
  React.useEffect(() => {
    setSelectedIds(new Set());
  }, [debouncedSearch]);

  // Пробелы карточек: «3 gaps» у строки ведёт в редактор деталей — иначе неполная карточка снаружи не видна.
  const [gapsByGameId, setGapsByGameId] = React.useState<Record<string, { gaps: number; errors: number }>>({});
  React.useEffect(() => {
    let cancelled = false;
    getCardCompletenessOverview()
      .then((overview) => {
        if (cancelled) return;
        setGapsByGameId(Object.fromEntries(overview.items.map((row) => [row.gameId, { gaps: row.issues.length, errors: row.errors }])));
      })
      .catch((error) => console.error("Failed to load card completeness", error));
    return () => {
      cancelled = true;
    };
  }, [items.length]);

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

  // /api/game/catalog — единственный эндпоинт с настоящей пагинацией и серверным поиском.
  // Прежний /api/game отдаёт ВЕСЬ каталог и молча игнорирует page и limit: страница
  // считала, что листает, а каждый раз выкачивала всё и показывала одно и то же.
  const fetchCatalogPage = React.useCallback(
    async (page: number, pageSize: number) => {
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      const params = buildAdminCatalogParams({ page, pageSize, kind: kindFilter, status: statusFilter, search: debouncedSearch });
      const response = await apiClient.api.get(`/api/game/catalog?${params.toString()}`);
      const payload = response.data as { items?: GameItem[]; total?: number };
      return { items: payload.items ?? [], total: payload.total ?? 0 };
    },
    [debouncedSearch, kindFilter, statusFilter],
  );

  // Окно строк для таблицы: границы приходят от неё по мере прокрутки.
  const loadGames = React.useCallback(
    async (skip: number, take: number) => {
      const window = await fetchWindow(skip, take, GRID_PAGE_SIZE, fetchCatalogPage);
      setItems((prev) => {
        if (skip === 0) {
          return window.items;
        }
        const known = new Set(prev.map((item: GameItem) => item.id));
        return [...prev, ...window.items.filter((item) => !known.has(item.id))];
      });
      return window;
    },
    [fetchCatalogPage],
  );

  const { source, retry, loaded, total: listTotal, error: listError } = useGridWindow<GameItem>(loadGames, "id", reloadToken);

  /** Перечитать список: данные изменились, а запрос — нет (сохранили, удалили, применили скидку). */
  const reloadList = React.useCallback(() => setReloadToken((token) => token + 1), []);

  // Поиск ушёл на сервер: фильтровать нечего, в items уже лежит ровно то, что нашлось.
  // Фильтрация на клиенте искала бы только по загруженным страницам — на большом
  // каталоге это значит «не находит ничего, что не успели подгрузить».
  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  /**
   * Массовая скидка. Скидки живут отдельной сущностью и правятся своим эндпоинтом на игру,
   * поэтому пачкой их менять безопасно — объект Game при этом не переписывается.
   *
   * Массовую правку цены сознательно НЕ делаю: она идёт через PUT всего объекта Game, а поле
   * prices (ручные цены по валютам) не отдаёт ни один эндпоинт — сохранение затирает его.
   * Плодить это на десятки игр разом нельзя, пока баг не закрыт.
   */
  const runBulkDiscount = async (mode: "apply" | "remove") => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      return;
    }
    setBulkRunning(true);
    const adminService = container.get<IAdminGameDetailsService>(IDENTIFIERS.IAdminGameDetailsService);
    const start = new Date().toISOString();
    const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    let ok = 0;
    const failed: string[] = [];
    // Последовательно, а не Promise.all: пачка может быть большой, и заливать сервер
    // сотней одновременных запросов ради удобства кода не стоит.
    for (const id of ids) {
      try {
        if (mode === "apply") {
          await adminService.upsertDiscount(id, { discountPercent: bulkPercent, startDate: start, endDate: end });
        } else {
          await adminService.deleteDiscount(id);
        }
        ok += 1;
      } catch {
        failed.push(id);
      }
    }
    setBulkRunning(false);
    setBulkConfirm(null);
    setSelectedIds(new Set());
    // Отчитываемся и об успехе, и о неудачах: молчаливая частичная ошибка на пачке —
    // худший исход, о ней узнают уже от покупателей.
    addToast(
      failed.length === 0
        ? `${mode === "apply" ? "Discount applied to" : "Discount removed from"} ${ok} game${ok === 1 ? "" : "s"}.`
        : `${ok} updated, ${failed.length} failed.`,
      failed.length === 0 ? "success" : "error"
    );
    reloadList();
  };

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
      (form.genre ?? "") !== (selectedGame.genre ?? "") ||
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
    if (form.kind === "Software" && !form.softwareCategory) {
      errors.softwareCategory = "Pick a software category.";
    }
    if (form.kind !== "Software" && !form.genre) {
      errors.genre = "Pick a genre.";
    }
    return errors;
  }, [form.description, form.name, form.price, form.title, form.kind, form.softwareCategory, form.genre]);

  const isFormValid = Object.keys(validationErrors).length === 0;

  // Была зашита RUB, при том что сервер считает чекаут в валюте каталога:
  // менеджер вводил цену и видел «1 999 ₽», а покупателю выставлялось $1999.
  const formatPrice = (price: number | undefined) =>
    formatMoney(typeof price === "number" ? price : 0, baseCurrency);

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
        prices: item.prices ?? {},
        description: item.description || "",
        descriptionI18n: item.descriptionI18n ?? {},
        title: item.title || "",
        gameType: item.gameType || 0,
        imagePath: item.imagePath || "",
        coverMediaId: item.coverMediaId || "",
        releaseDate: item.releaseDate ? item.releaseDate.split("T")[0] : "",
        parentGameId: item.parentGameId ?? "",
        // Вид и категория — для подписей и полей формы правки («Edit software», жанр только у игр).
        kind: item.kind === "Software" ? "Software" : "Game",
        softwareCategory: item.softwareCategory ?? "",
        genre: item.genre ?? "",
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
    setSelectedGameId(item.id);
    setSelectedGame(item);
    applyFormFromGame(item);
    if (item.coverMediaId) {
      fetchMediaDetails(item.coverMediaId);
    } else {
      setSelectedMedia(null);
    }
    // Подробности показываем дровером всегда. Раньше на широком экране их держала боковая
    // панель, из-за которой список ужимался вдвое и прятал часть колонок — при том что она
    // пустовала до первого выбора.
    setDetailsDrawerOpen(true);
  };

  const handleEditGame = (item: GameItem) => {
    handleSelectGame(item);
    setDetailsDrawerOpen(false);
    navigate(`/admin/games/${item.id}/edit`);
  };

  const handleCreateGame = useCallback(() => {
    resetForm();
    setCreateAsDraft(true);
    setDrawerMode("create");
    setDrawerOpen(true);
    setDetailsDrawerOpen(false);
  }, [resetForm]);

  React.useEffect(() => {
    setPageTitle("Catalog");
  }, [setPageTitle]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    dispatch({
      type: "SET_GAME_TYPE_FORM",
      payload: {
        ...form,
        [name]: name === "price" || name === "gameType" ? Number(value) : value,
      },
    });
  };

  /**
   * Цена в дополнительной валюте. Пустое поле убирает валюту из прайс-листа целиком —
   * это «не продаём», а не «ноль»: ноль сделал бы игру бесплатной, а не скрыл её.
   */
  // Каталожный DTO ручных цен по валютам не отдаёт — они нужны только админке, а в ответ
  // витрины добавили бы всем покупателям прайс по валютам, которые ещё не запущены.
  // Поэтому грузим их отдельным запросом и запоминаем факт загрузки: пока цены не приехали,
  // форма не имеет права их отправлять (см. buildPayload).
  const [manualPricesLoaded, setManualPricesLoaded] = useState(false);
  // Ссылка на свежую форму: догрузка асинхронная, и замыкание с form затёрло бы правки,
  // сделанные админом, пока запрос летел.
  const formRef = useRef(form);
  formRef.current = form;

  useEffect(() => {
    // Одна валюта в магазине — раздела «цены в других валютах» нет и грузить нечего.
    if (!selectedGameId || extraCurrencies.length === 0) {
      setManualPricesLoaded(false);
      return;
    }
    let cancelled = false;
    setManualPricesLoaded(false);
    getGamePrices(selectedGameId)
      .then((data) => {
        if (cancelled) {
          return;
        }
        dispatch({ type: "SET_GAME_TYPE_FORM", payload: { ...formRef.current, prices: data.prices ?? {} } });
        setManualPricesLoaded(true);
      })
      .catch(() => {
        // Не загрузилось — оставляем manualPricesLoaded false: сохранение просто не тронет цены,
        // что безопаснее, чем отправить пустой прайс-лист.
      });
    return () => {
      cancelled = true;
    };
  }, [selectedGameId, extraCurrencies.length, dispatch]);

  const handlePriceInCurrencyChange = (code: string, value: string) => {
    const prices = { ...(form.prices ?? {}) };
    const trimmed = value.trim();

    if (trimmed === "" || Number.isNaN(Number(trimmed))) {
      delete prices[code];
    } else {
      prices[code] = Number(trimmed);
    }

    dispatch({ type: "SET_GAME_TYPE_FORM", payload: { ...form, prices } });
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
    // Пустой выбор — обычная игра: поле не шлём, чтобы в базе не лежала пустая строка.
    if (!payload.parentGameId) {
      delete cleaned.parentGameId;
    }
    // В форме вид — строка, как в каталоге; сервер же читает перечисление числом (0 — игра, 1 — ПО).
    // Категория — только у ПО; DLC у ПО не бывает.
    cleaned.kind = payload.kind === "Software" ? 1 : 0;
    if (payload.kind === "Software") {
      delete cleaned.parentGameId;
      delete cleaned.genre;
    } else {
      delete cleaned.softwareCategory;
    }
    if (!payload.coverMediaId) {
      delete cleaned.coverMediaId;
    }
    if (!payload.description) {
      delete cleaned.description;
    }
    // Прайс-лист по валютам отправляем, только если форма его действительно загрузила.
    // Иначе пустой объект прочитался бы сервером как «снять все ручные цены» и затёр бы то,
    // что выставлено в /admin/prices; отсутствие поля означает «не трогать».
    if (!manualPricesLoaded) {
      delete cleaned.prices;
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
        const response = await apiClient.api.post(createAsDraft ? "/api/game?draft=true" : "/api/game", payload);
        createdId = response.data?.id ?? response.data?.gameId ?? null;
      }

      reloadList();
      const refreshed = await fetchCatalogPage(1, GRID_PAGE_SIZE);

      const targetId = drawerMode === "create" ? createdId ?? updatedItem.id : selectedGame?.id;
      const refreshedSelection = refreshed.items.find((item) => item.id === targetId);
      if (refreshedSelection) {
        setSelectedGameId(refreshedSelection.id);
        setSelectedGame(refreshedSelection);
        applyFormFromGame(refreshedSelection);
      }

      const wasCreate = drawerMode === "create";
      const noun = updatedItem.kind === "Software" ? "Software" : "Game";
      const createdAsDraft = createAsDraft;
      setDrawerOpen(false);
      setDrawerMode(null);
      resetForm();
      setDetailsDrawerOpen(false);
      // Сбрасываем «грязное» состояние формы ДО любой навигации, иначе guard из useDirtyState
      // перехватит programmatic navigate и покажет «You have unsaved changes».
      if (wasCreate && createdId) {
        // Вместо мгновенного перехода — notify-плашка с кнопкой перехода и прогресс-баром.
        addToast(
          createdAsDraft
            ? `${noun} created as a draft — fill in the card and publish it in the editor.`
            : `${noun} created and published.`,
          "success",
          {
          action: {
            label: "Open editor",
            onClick: () => navigate(`/admin/games/${createdId}/edit`),
          },
        });
      } else {
        addToast(wasCreate ? `${noun} created` : "Changes saved", "success");
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
      reloadList();
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

  const drawerTitle = drawerMode === "create"
    ? (form.kind === "Software" ? "Create software" : "Create game")
    : (form.kind === "Software" ? "Edit software" : "Edit game");

  return (
    <div className="admin-grid">
      <PageHeader
        title="Catalog editor"
        description="Create, update, and organize games and software. New products start as drafts. Pick a row to open its details."
        breadcrumbs={["Catalog"]}
        tabs={GAMES_TABS}
      />

      <div className="admin-grid">
        <Card>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="admin-topbar__search">
              <span>🔎</span>
              <input
                type="text"
                placeholder="Search games and software..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && (
                <button className="btn btn-outline" onClick={handleClearSearch}>
                  ✕
                </button>
              )}
            </div>
            <div className="kind-switch" role="radiogroup" aria-label="Show products">
              {([
                ["all", "All"],
                ["game", "Games"],
                ["software", "Software"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={kindFilter === value}
                  className={kindFilter === value ? "is-active" : ""}
                  onClick={() => setKindFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="kind-switch" role="radiogroup" aria-label="Publication status">
              {([
                ["all", "Any status"],
                ["published", "Published"],
                ["draft", "Drafts"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={statusFilter === value}
                  className={statusFilter === value ? "is-active" : ""}
                  onClick={() => setStatusFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button className="btn btn-outline" type="button" onClick={() => setGenresOpen(true)}>
                Game genres
              </button>
              <button className="btn btn-outline" type="button" onClick={() => setCategoriesOpen(true)}>
                Software categories
              </button>
              <button className="btn btn-primary" type="button" onClick={handleCreateGame}>
                + Add product
              </button>
            </div>
          </div>

          <div className="mt-4">
            {listError ? (
              <EmptyState
                title="Unable to load games"
                description={listError}
                action={
                  <button className="btn btn-primary" onClick={retry}>
                    Retry
                  </button>
                }
              />
            ) : (
              <>
              {/* Панель массовых действий появляется только при непустом выделении:
                  постоянная строка кнопок над таблицей отвлекала бы в обычной работе. */}
              {selectedIds.size > 0 && (
                <div className="bulk-bar">
                  <span className="bulk-bar__count">{selectedIds.size} selected</span>
                  <label className="bulk-bar__percent">
                    Discount
                    <input
                      type="number"
                      min={1}
                      max={95}
                      className="input"
                      value={bulkPercent}
                      onChange={(event) => setBulkPercent(Number(event.target.value))}
                    />
                    %
                  </label>
                  <button type="button" className="btn btn-primary" disabled={bulkRunning} onClick={() => setBulkConfirm("apply")}>
                    Apply discount
                  </button>
                  <button type="button" className="btn btn-outline" disabled={bulkRunning} onClick={() => setBulkConfirm("remove")}>
                    Remove discount
                  </button>
                  <button type="button" className="btn btn-outline" disabled={bulkRunning} onClick={() => setSelectedIds(new Set())}>
                    Clear
                  </button>
                  {bulkRunning && <span className="bulk-bar__count">Working…</span>}
                </div>
              )}

              <DataGrid
                dataSource={source}
                showBorders
                showRowLines
                height={560}
                width="100%"
                columnAutoWidth
                allowColumnResizing
                columnResizingMode="widget"
                remoteOperations={REMOTE_PAGING}
                noDataText="The catalog is empty — add the first game to start selling."
                onRowPrepared={(event) => {
                  if (event.rowType === "data" && (event.data as GameItem).id === selectedGameId) {
                    event.rowElement.classList.add("admin-table__row-selected");
                  }
                }}
              >
                <Scrolling mode="virtual" rowRenderingMode="virtual" showScrollbar="always" />
                <Paging enabled pageSize={GRID_PAGE_SIZE} />
                {/* Порядок задаёт сервер; сортировка загруженного окна врала бы. */}
                <Sorting mode="none" />

                <Column
                  caption=""
                  width={46}
                  allowSorting={false}
                  headerCellRender={() => (
                    /* Выделяет только загруженные строки: обещать «все 10 000» кнопка не может —
                       операции идут по одной игре, и пачка должна быть обозримой. */
                    <input
                      type="checkbox"
                      aria-label="Select all loaded games"
                      checked={items.length > 0 && selectedIds.size === items.length}
                      ref={(node) => {
                        if (node) {
                          node.indeterminate = selectedIds.size > 0 && selectedIds.size < items.length;
                        }
                      }}
                      onChange={(event) =>
                        setSelectedIds(event.target.checked ? new Set(items.map((row) => row.id)) : new Set())
                      }
                    />
                  )}
                  cellRender={(cell) => (
                    <input
                      type="checkbox"
                      aria-label={`Select ${cell.data.name ?? "game"}`}
                      checked={selectedIds.has(cell.data.id)}
                      onChange={() => toggleSelected(cell.data.id)}
                    />
                  )}
                />
                <Column
                  dataField="name"
                  caption="Name"
                  minWidth={260}
                  cellRender={(cell) => (
                    <button className="text-left" onClick={() => handleSelectGame(cell.data)}>
                      <strong title={cell.data.name || "Unnamed"} className="admin-table__cell-truncate">
                        {cell.data.name || "Unnamed"}
                      </strong>
                      {renderReleaseStatus(cell.data)}
                      {cell.data.parentGameId && (
                        <span className="admin-release-pills">
                          <span className="admin-release-pill" title="DLC — sold from the base game page">DLC</span>
                        </span>
                      )}
                      {cell.data.isDraft && (
                        <span className="admin-kind-pill is-draft" title="Draft — not visible in the store until published in the card editor">
                          Draft
                        </span>
                      )}
                      {cell.data.kind === "Software" && (
                        <span className="admin-kind-pill" title="Software — found in the catalog under the Software product type">
                          Software{cell.data.softwareCategory ? ` · ${categoryTitle(cell.data.softwareCategory)}` : ""}
                        </span>
                      )}
                      {gapsByGameId[cell.data.id] && (
                        <button
                          type="button"
                          className={`admin-gaps-pill${gapsByGameId[cell.data.id].errors > 0 ? " admin-gaps-pill--errors" : ""}`}
                          title="Card is incomplete — open Details to fill the gaps"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(`/admin/games/${cell.data.id}/edit`);
                          }}
                        >
                          {gapsByGameId[cell.data.id].gaps} {gapsByGameId[cell.data.id].gaps === 1 ? "gap" : "gaps"}
                        </button>
                      )}
                      <div className="admin-table__cell-muted admin-table__cell-truncate" title={cell.data.title}>
                        {cell.data.title}
                      </div>
                    </button>
                  )}
                />
                <Column
                  caption="Price"
                  width={120}
                  cellRender={(cell) => <span>{formatPrice(cell.data.price)}</span>}
                />
                <Column
                  caption="Type"
                  width={120}
                  cellRender={(cell) => (
                    <span className="admin-table__cell-muted">
                      {cell.data.kind === "Software" ? "Software" : cell.data.category || "—"}
                    </span>
                  )}
                />
                <Column
                  caption="Release date"
                  width={140}
                  cellRender={(cell) => (
                    <span className="admin-table__cell-muted">{cell.data.releaseDate?.split("T")[0] ?? "—"}</span>
                  )}
                />
                <Column
                  caption="Actions"
                  width={180}
                  cellRender={(cell) => (
                    <div className="flex gap-2">
                      <button className="btn btn-outline" onClick={() => handleEditGame(cell.data)}>
                        Edit
                      </button>
                      <button className="btn btn-outline" onClick={() => requestDelete(cell.data.id)}>
                        Delete
                      </button>
                    </div>
                  )}
                />
              </DataGrid>
              </>
            )}
            <p className="mt-3 text-xs text-gray-500">{gridStatusText(loaded, listTotal, "game")}</p>
          </div>
        </Card>

      </div>

      <Drawer
        isOpen={drawerOpen}
        title={drawerTitle}
        onClose={handleDrawerClose}
      >
        <form onSubmit={handleSubmit} className="stack-y-4">
          {/* Вид выбирается при создании: от него зависят раздел витрины, поля карточки и налоговый код.
              Позже его можно сменить в редакторе карточки. */}
          {drawerMode === "create" && (
            <Card>
              <h3>Product type</h3>
              <div className="kind-switch" role="radiogroup" aria-label="Product type">
                {[
                  { value: "Game" as const, label: "Game" },
                  { value: "Software" as const, label: "Software" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={(form.kind ?? "Game") === option.value}
                    className={(form.kind ?? "Game") === option.value ? "is-active" : ""}
                    onClick={() => dispatch({ type: "SET_GAME_TYPE_FORM", payload: { ...form, kind: option.value } })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {form.kind === "Software" && (
                <>
                  <label className="text-sm font-semibold mt-3 block">Software category</label>
                  <select name="softwareCategory" value={form.softwareCategory ?? ""} onChange={handleChange} className="w-full p-2 border rounded-sm">
                    <option value="">— pick a category —</option>
                    {softwareCategories.map((category) => (
                      <option key={category.tag} value={category.tag}>
                        {category.title}
                      </option>
                    ))}
                  </select>
                  {validationErrors.softwareCategory && <small className="text-red-500">{validationErrors.softwareCategory}</small>}
                  <p className="text-xs text-gray-500 mt-2">
                    Licenses (term and devices), activation and operating systems are set in the card editor after creating.
                  </p>
                </>
              )}
            </Card>
          )}

          {drawerMode === "create" && (
            <Card>
              <h3>Visibility</h3>
              <div className="kind-switch" role="radiogroup" aria-label="Visibility after creating">
                {([
                  [true, "Draft"],
                  [false, "Published"],
                ] as const).map(([draft, label]) => (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={createAsDraft === draft}
                    className={createAsDraft === draft ? "is-active" : ""}
                    onClick={() => setCreateAsDraft(draft)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {createAsDraft
                  ? "Hidden from the store. Fill in the card (description, cover, " + (form.kind === "Software" ? "licenses, keys" : "keys") + ") and publish it in the card editor."
                  : "Goes on sale right away — with only what this form has: no description page, gallery or " + (form.kind === "Software" ? "licenses" : "editions") + " yet."}
              </p>
            </Card>
          )}

          <Card>
            <h3>Basic info</h3>
            <label className="text-sm font-semibold">Name</label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              className="w-full p-2 border rounded-sm"
              ref={nameInputRef}
            />
            {validationErrors.name && <small className="text-red-500">{validationErrors.name}</small>}
            <label className="text-sm font-semibold">Title</label>
            <input
              type="text"
              name="title"
              value={form.title}
              onChange={handleChange}
              className="w-full p-2 border rounded-sm"
            />
            {validationErrors.title && <small className="text-red-500">{validationErrors.title}</small>}
          </Card>

          <Card>
            <h3>Content</h3>
            <label className="text-sm font-semibold">Description</label>
            <LocalizedField
              label="Description"
              multiline
              rows={5}
              i18n={form.descriptionI18n}
              placeholder={form.description}
              onI18nChange={(next) => dispatch({ type: "SET_GAME_TYPE_FORM", payload: { ...form, descriptionI18n: next } })}
            >
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.stopPropagation();
                  }
                }}
                className="w-full p-2 border rounded-sm min-h-[120px]"
              />
            </LocalizedField>
            <div className="flex justify-between text-xs text-gray-500">
              <span>{form.description?.length ?? 0} / 500</span>
              {validationErrors.description && <span className="text-red-500">{validationErrors.description}</span>}
            </div>
          </Card>

          <Card>
            <h3>Action settings</h3>
            <label className="text-sm font-semibold">Price, {baseCurrency}</label>
            <input
              type="number"
              name="price"
              value={form.price}
              onChange={handleChange}
              className="w-full p-2 border rounded-sm"
            />
            {validationErrors.price && <small className="text-red-500">{validationErrors.price}</small>}

            {extraCurrencies.length > 0 && (
              <div className="mt-4">
                <label className="text-sm font-semibold">Prices in other currencies</label>
                {/* Пустое поле — не ноль и не «посчитать по курсу»: в этой валюте игра просто
                    не продаётся и на витрине в ней не появится. Курсы придут Этапом 4. */}
                <p className="text-xs text-gray-500 mb-2">
                  Leave empty if the game isn't sold in that currency — it won't be listed there.
                </p>
                {extraCurrencies.map((code) => (
                  <div key={code} className="flex items-center gap-2 mb-2">
                    <span className="w-12 text-sm font-semibold">{code}</span>
                    <input
                      type="number"
                      value={form.prices?.[code] ?? ""}
                      onChange={(event) => handlePriceInCurrencyChange(code, event.target.value)}
                      placeholder="not sold"
                      className="flex-1 p-2 border rounded-sm"
                    />
                  </div>
                ))}
              </div>
            )}
            {/* Жанр — игровое понятие: у ПО вместо него категория раздела. Список — из настроек (кнопка «Game genres»). */}
            {form.kind !== "Software" && (
              <>
                <label className="text-sm font-semibold">Genre</label>
                <select name="genre" value={form.genre ?? ""} onChange={handleChange} className="w-full p-2 border rounded-sm">
                  <option value="">— pick a genre —</option>
                  {/* Жанр, которого уже нет в списке, не теряем: иначе форма молча сменила бы его при сохранении. */}
                  {form.genre && !genres.some((genre) => genre.tag === form.genre) && (
                    <option value={form.genre}>{form.genre}</option>
                  )}
                  {genres.map((genre) => (
                    <option key={genre.tag} value={genre.tag}>
                      {genre.title}
                    </option>
                  ))}
                </select>
                {validationErrors.genre && <small className="text-red-500">{validationErrors.genre}</small>}
              </>
            )}
          </Card>

          {form.kind !== "Software" && (
          <Card>
            <h3>DLC</h3>
            {/* DLC — отдельный товар с базовой игрой: в каталоге он не в общем списке, а в блоке
                «DLC» базовой игры; на его странице — «требуется базовая игра». */}
            <label className="text-sm font-semibold">DLC of (base game)</label>
            <select name="parentGameId" value={form.parentGameId ?? ""} onChange={handleChange} className="w-full p-2 border rounded-sm">
              <option value="">— not a DLC —</option>
              {items
                .filter((item) => item.id !== form.id && !item.parentGameId)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title || item.name}
                  </option>
                ))}
            </select>
          </Card>
          )}

          <Card>
            <h3>Date</h3>
            <label className="text-sm font-semibold">Release date</label>
            <input
              type="date"
              name="releaseDate"
              value={form.releaseDate.split("T")[0]}
              onChange={handleChange}
              className="w-full p-2 border rounded-sm"
            />
          </Card>

          <Card>
            <h3>Media</h3>
            {form.coverMediaId && selectedMedia ? (
              <div className="stack-y-3">
                <div className="h-36 w-full overflow-hidden rounded-sm border">
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
                {/* Точка фокуса: одна обложка живёт в квадрате, вертикали и широкой полосе — админ показывает, что в ней главное. */}
                <CoverFocusEditor key={selectedMedia.url} imageUrl={selectedMedia.url} />
              </div>
            ) : form.imagePath ? (
              <div className="stack-y-3">
                <div className="h-36 w-full overflow-hidden rounded-sm border">
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
                <CoverFocusEditor key={form.imagePath} imageUrl={getLegacyPreviewUrl(form.imagePath)} />
              </div>
            ) : (
              <div className="stack-y-3">
                <div className="h-36 w-full rounded-sm border border-dashed flex items-center justify-center text-sm text-gray-500">
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
                  ? form.kind === "Software" ? "Create software" : "Create game"
                  : "Save changes"}
            </button>
          </div>
        </form>
      </Drawer>

      <Drawer
        isOpen={detailsDrawerOpen && !drawerOpen}
        title={selectedGame?.kind === "Software" ? "Software" : "Game"}
        onClose={() => setDetailsDrawerOpen(false)}
      >
        {selectedGame ? (
          <div className="stack-y-4">
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
            {/* Публикация — сюда, а не кнопкой в панели: опубликовать можно только в редакторе карточки,
                где видно, чего в ней не хватает. */}
            <Card>
              <h3>Visibility</h3>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p>
                  {selectedGame.isDraft
                    ? <><strong>Draft</strong> — not visible in the store.</>
                    : <><strong>Published</strong> — visible in the store.</>}
                </p>
                <button className="btn btn-outline" onClick={() => navigate(`/admin/games/${selectedGame.id}/edit`)}>
                  {selectedGame.isDraft ? "Open editor to publish" : "Open editor"}
                </button>
              </div>
            </Card>
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
              {selectedGame.kind === "Software"
                ? <p><strong>Category:</strong> {categoryTitle(selectedGame.softwareCategory) || "—"}</p>
                : <p><strong>Genre:</strong> {selectedGame.category || "—"}</p>}
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
                    <img src={selectedMedia.url} alt={selectedMedia.filename} className="h-12 w-12 rounded-sm object-cover" />
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
                    className="h-12 w-12 rounded-sm object-cover"
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
          />
        )}
      </Drawer>

      <Drawer isOpen={categoriesOpen} title="Software categories" onClose={() => setCategoriesOpen(false)}>
        {categoriesOpen && <SoftwareCategoriesEditor onSaved={setSoftwareCategories} />}
      </Drawer>

      <Drawer isOpen={genresOpen} title="Game genres" onClose={() => setGenresOpen(false)}>
        {genresOpen && (
          <GameGenresEditor
            onSaved={(saved) => {
              setGenres(saved);
              // Названия жанров видны в колонке Type — перечитываем список.
              reloadList();
            }}
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
        isOpen={bulkConfirm !== null}
        title={bulkConfirm === "remove" ? "Remove discount from selected games?" : "Apply discount to selected games?"}
        description={
          bulkConfirm === "remove"
            ? `Discount will be removed from ${selectedIds.size} game(s).`
            : `${bulkPercent}% discount will run for 30 days on ${selectedIds.size} game(s).`
        }
        confirmLabel={bulkConfirm === "remove" ? "Remove" : "Apply"}
        onConfirm={() => bulkConfirm && runBulkDiscount(bulkConfirm)}
        onCancel={() => setBulkConfirm(null)}
      />

      <ModalConfirm
        isOpen={isDeleteOpen}
        title={`Delete game “${pendingDeleteName ?? "Unnamed"}”?`}
        description="This cannot be undone."
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
