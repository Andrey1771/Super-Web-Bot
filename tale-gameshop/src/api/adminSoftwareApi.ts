import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";

const api = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

/** Категория раздела /software: tag — адрес (/software/category/{tag}), title — название, count — товаров в ней. */
export interface AdminSoftwareCategory {
  tag: string;
  title: string;
  /** Названия на языках сайта (ru/uk/pl); английское — title. */
  titles?: Record<string, string> | null;
  count: number;
}

export type ProductKindValue = "Game" | "Software";

export interface ProductKindState {
  kind: ProductKindValue;
  softwareCategory: string | null;
}

/**
 * Копия товара черновиком: карточка, лицензии с ценами, активация и системы. Ключи и отзывы не копируются.
 * Удобно для похожих позиций — ещё один VPN с той же линейкой лицензий.
 */
export const duplicateProduct = async (gameId: string): Promise<{ id: string; slug: string; title: string }> =>
  (await api().post(`/api/admin/games/${gameId}/duplicate`)).data;

/** Текст ошибки сервера для тоста: сервер объясняет, что не так («Move the products out first: …»). */
export const apiErrorMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

export const getAdminSoftwareCategories = async (): Promise<AdminSoftwareCategory[]> => {
  const { data } = await api().get("/api/admin/software/categories");
  return Array.isArray(data) ? data : [];
};

/** Сохраняет список целиком — порядок массива становится порядком раздела. */
export const saveAdminSoftwareCategories = async (categories: Array<{ tag: string; title: string; titles?: Record<string, string> }>): Promise<AdminSoftwareCategory[]> => {
  const { data } = await api().put("/api/admin/software/categories", categories);
  return Array.isArray(data) ? data : [];
};

export const getProductKind = async (gameId: string): Promise<ProductKindState> =>
  (await api().get(`/api/admin/software/products/${gameId}/kind`)).data;

export const setProductKind = async (gameId: string, state: ProductKindState): Promise<ProductKindState> =>
  (await api().put(`/api/admin/software/products/${gameId}/kind`, state)).data;
