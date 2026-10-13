import type { Game } from "../models/game";
import { currentCurrency } from "../context/site-preferences";
import { apiClient } from "./client";

/** Вариант фильтра и число результатов, которое он даст. */
/** label — подпись на языке сайта (жанры); value остаётся значением фильтра. */
export type FacetCount = { value: string; count: number; label?: string };

/** Столбик гистограммы цен: сколько игр стоит в диапазоне from..to. */
export type PriceBucket = { from: number; to: number; count: number };

/** Готовый диапазон цены одним кликом. `to: null` — верхней границы нет («от $50»). */
export type PricePreset = { label: string; from: number; to: number | null; count: number };

export type CatalogFacets = {
  categories: FacetCount[];
  platforms: FacetCount[];
  availability: { inStock: number; onSale: number; comingSoon: number };
  /** Фильтр «DLC»: сколько игр с дополнениями и сколько самих дополнений при остальных фильтрах. */
  dlc?: { has: number; only: number };
  /** Распределение цен по всему каталогу — строится БЕЗ учёта самого ценового фильтра. */
  priceHistogram: PriceBucket[];
  /** Диапазоны в один клик. Пустые сервер не присылает. */
  pricePresets: PricePreset[];
  /** Фильтры раздела /software. У игр списки пустые. */
  software?: {
    categories: FacetCount[];
    /** «12», «24», «lifetime». */
    terms: FacetCount[];
    /** «1», «3», «10+». */
    devices: FacetCount[];
    activation: FacetCount[];
  };
  /** Совпадения поиска по видам товара: Game, Software. */
  kinds?: FacetCount[];
};

/** title — английское название (адреса, фильтры), label — на языке сайта. */
export type SoftwareCategory = { tag: string; title: string; count: number; label?: string };

/** Жанр игр: tag — адрес страницы жанра (/games/category/{tag}), title — название из админки. */
export type GameGenre = { tag: string; title: string; count: number; label?: string };

/** Жанры игр в порядке настроек, с числом опубликованных игр. */
export const getGameGenres = async (): Promise<GameGenre[]> => {
  const response = await apiClient().get('/api/game/genres');
  return Array.isArray(response.data) ? response.data : [];
};

/** Категории раздела /software в порядке настроек, с числом товаров. */
export const getSoftwareCategories = async (): Promise<{ total: number; categories: SoftwareCategory[] }> => {
  const response = await apiClient().get(`/api/game/software-categories?currency=${encodeURIComponent(currentCurrency())}`);
  return {
    total: Number(response.data?.total ?? 0),
    categories: Array.isArray(response.data?.categories) ? response.data.categories : [],
  };
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
