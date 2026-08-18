import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";
import type { Game } from "../models/game";
import { currentCurrency } from "../context/site-preferences";

const apiClient = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

/** Строка недельного чарта продаж: сколько копий игры продано за последние 7 дней. */
export type WeeklyChartEntry = {
  gameId: string;
  sold: number;
};

/**
 * Продажи за неделю, уже отсортированные сервером по убыванию.
 * Источник «популярности» и на главной, и в сортировке каталога — считает и кэширует бэкенд.
 */
export const getWeeklyChart = async (): Promise<WeeklyChartEntry[]> => {
  const response = await apiClient().get("/api/game/weekly-chart");
  return Array.isArray(response.data) ? response.data : [];
};

/** Вариант фильтра и число результатов, которое он даст. */
export type FacetCount = { value: string; count: number };

/** Столбик гистограммы цен: сколько игр стоит в диапазоне from..to. */
export type PriceBucket = { from: number; to: number; count: number };

/** Готовый диапазон цены одним кликом. `to: null` — верхней границы нет («от $50»). */
export type PricePreset = { label: string; from: number; to: number | null; count: number };

export type CatalogFacets = {
  categories: FacetCount[];
  platforms: FacetCount[];
  availability: { inStock: number; onSale: number; comingSoon: number };
  /** Распределение цен по всему каталогу — строится БЕЗ учёта самого ценового фильтра. */
  priceHistogram: PriceBucket[];
  /** Диапазоны в один клик. Пустые сервер не присылает. */
  pricePresets: PricePreset[];
};

export type CatalogPage = {
  items: Game[];
  total: number;
  page: number;
  pageSize: number;
  /** Границы по ВСЕМУ каталогу, а не по текущей выдаче — иначе ползунок цены сжимался бы сам. */
  priceRange: { min: number; max: number };
  facets: CatalogFacets;
};

export const EMPTY_CATALOG_PAGE: CatalogPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 24,
  priceRange: { min: 0, max: 0 },
  facets: {
    categories: [],
    platforms: [],
    availability: { inStock: 0, onSale: 0, comingSoon: 0 },
    priceHistogram: [],
    pricePresets: [],
  },
};

/**
 * Страница каталога. Отбор, поиск, порядок и счётчики фильтров считает сервер —
 * витрина получает ровно то, что показывает.
 *
 * Параметры передаются как есть из адресной строки: их набор совпадает с тем,
 * что понимает эндпоинт, поэтому ссылку на отфильтрованный каталог можно просто скопировать.
 */
export const getCatalogPage = async (params: URLSearchParams): Promise<CatalogPage> => {
  const response = await apiClient().get(`/api/game/catalog?${withCurrency(params).toString()}`);
  return response.data ?? EMPTY_CATALOG_PAGE;
};

/**
 * Валюта покупателя добавляется к запросу здесь, а не в каждом вызывающем: сервер вернёт
 * цены уже в ней, и витрина покажет ровно то, что посчитал сервер. Валюта из адресной строки
 * (её кладёт сам пользователь) имеет приоритет — иначе ссылкой на каталог в евро нельзя было бы
 * поделиться. Неподдерживаемое значение сервер приведёт к базовой валюте сам.
 */
const withCurrency = (params: URLSearchParams): URLSearchParams => {
  if (params.has("currency")) {
    return params;
  }

  const next = new URLSearchParams(params);
  next.set("currency", currentCurrency());
  return next;
};
