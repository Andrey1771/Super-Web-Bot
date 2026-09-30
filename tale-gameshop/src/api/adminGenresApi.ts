import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";

const api = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

/** Жанр игр: tag — адрес страницы жанра и значение у игры, title — название, count — игр в нём (с черновиками). */
export interface AdminGenre {
  tag: string;
  title: string;
  /** Названия на языках сайта (ru/uk/pl); английское — title. */
  titles?: Record<string, string> | null;
  count: number;
}

export const getAdminGenres = async (): Promise<AdminGenre[]> => {
  const { data } = await api().get("/api/admin/genres");
  return Array.isArray(data) ? data : [];
};

/** Сохраняет список целиком — порядок массива становится порядком жанров в фильтрах. */
export const saveAdminGenres = async (genres: Array<{ tag: string; title: string; titles?: Record<string, string> }>): Promise<AdminGenre[]> => {
  const { data } = await api().put("/api/admin/genres", genres);
  return Array.isArray(data) ? data : [];
};
