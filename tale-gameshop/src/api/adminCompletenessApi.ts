import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";

const api = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

export type CardIssueSeverity = "error" | "warning" | "info";

export interface CardIssue {
  code: string;
  message: string;
  severity: CardIssueSeverity;
}

export interface CardCompletenessRow {
  gameId: string;
  title: string;
  errors: number;
  warnings: number;
  infos: number;
  issues: CardIssue[];
}

/** Пробелы карточки одной игры — для панели предупреждений в редакторе (на входе и после сохранения). */
export const getCardCompleteness = async (gameId: string): Promise<CardIssue[]> => {
  const { data } = await api().get(`/api/admin/games/${gameId}/completeness`);
  return Array.isArray(data?.issues) ? data.issues : [];
};

/** Пробелы по всему каталогу — для списка игр («3 gaps») и дашборда. */
export const getCardCompletenessOverview = async (): Promise<{ total: number; incomplete: number; items: CardCompletenessRow[] }> =>
  (await api().get("/api/admin/games/completeness")).data;
