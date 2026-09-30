import { apiClient } from "./client";

/** Ячейка прайс-листа: действующая цена и откуда она. */
export type PriceCell = {
  price: number | null;
  /** base — базовая цена игры; manual — из прайс-листа; rate — по курсу; none — не продаётся. */
  source: "base" | "manual" | "rate" | "none";
  /** Ручное значение (для base — базовая цена), иначе null. */
  manual: number | null;
};

export type PriceRow = {
  gameId: string;
  title: string;
  baseCurrency: string;
  basePrice: number;
  cells: Record<string, PriceCell>;
};

/** Сводка по всему каталогу, а не по окну строк. Приходит только с первым окном. */
export type PriceSummary = {
  total: number;
  perCurrency: Array<{ currency: string; sold: number; manual: number; missing: number }>;
};

export type PriceMatrix = {
  baseCurrency: string;
  currencies: string[];
  markupPercent: number;
  rates: Record<string, number | null>;
  games: PriceRow[];
  /** Сколько игр подходит под фильтр — по нему таблица знает длину полосы прокрутки. */
  total: number;
  summary: PriceSummary | null;
};

/** Ручные цены одной игры: код валюты → сумма. Цены в базовой валюте здесь нет — она в basePrice. */
export type GamePrices = {
  gameId: string;
  baseCurrency: string;
  basePrice: number;
  prices: Record<string, number>;
};

/**
 * Прайс-лист одной игры. Нужен форме каталога: она сохраняет игру целиком, и без загрузки
 * этих значений отправляла бы пустой объект, стирая всё, что выставлено в /admin/prices.
 */
export const getGamePrices = async (gameId: string): Promise<GamePrices> =>
  (await apiClient().get(`/api/admin/prices/${encodeURIComponent(gameId)}`)).data;

export const getPriceMatrix = async (options: {
  q?: string;
  skip?: number;
  take?: number;
  onlyManual?: boolean;
} = {}): Promise<PriceMatrix> =>
  (
    await apiClient().get("/api/admin/prices", {
      params: {
        ...(options.q ? { q: options.q } : {}),
        skip: options.skip ?? 0,
        take: options.take ?? 50,
        ...(options.onlyManual ? { onlyManual: true } : {}),
      },
    })
  ).data;

/** price = null — снять ручную цену (вернуться к курсу / «не продаётся»). */
export const setPrice = async (gameId: string, currency: string, price: number | null): Promise<{ cell: PriceCell }> =>
  (await apiClient().put(`/api/admin/prices/${encodeURIComponent(gameId)}/${encodeURIComponent(currency)}`, { price })).data;
