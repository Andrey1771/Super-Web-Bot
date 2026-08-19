import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";

const apiClient = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

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

export type PriceMatrix = {
  baseCurrency: string;
  currencies: string[];
  markupPercent: number;
  rates: Record<string, number | null>;
  games: PriceRow[];
};

export const getPriceMatrix = async (q?: string): Promise<PriceMatrix> =>
  (await apiClient().get("/api/admin/prices", { params: q ? { q } : {} })).data;

/** price = null — снять ручную цену (вернуться к курсу / «не продаётся»). */
export const setPrice = async (gameId: string, currency: string, price: number | null): Promise<{ cell: PriceCell }> =>
  (await apiClient().put(`/api/admin/prices/${encodeURIComponent(gameId)}/${encodeURIComponent(currency)}`, { price })).data;
