import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";

const apiClient = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

export type SiteReviewQuote = {
  author: string;
  rating: number;
  text: string;
  verifiedPurchase: boolean;
  createdAt: string;
  gameTitle: string | null;
  gameSlug: string | null;
};

/**
 * Рейтинг магазина по всем опубликованным отзывам.
 * `count: 0` — законное состояние (отзывов ещё нет), витрина рисует по нему пустое состояние.
 */
export type SiteReviewSummary = {
  average: number;
  count: number;
  /** Оценка (1-5) → сколько раз поставлена. Оценки без отзывов в объекте отсутствуют. */
  distribution: Record<string, number>;
  quotes: SiteReviewQuote[];
};

export const EMPTY_SITE_REVIEW_SUMMARY: SiteReviewSummary = {
  average: 0,
  count: 0,
  distribution: {},
  quotes: [],
};

export const getSiteReviewSummary = async (): Promise<SiteReviewSummary> => {
  const response = await apiClient().get("/api/reviews/summary");
  return response.data ?? EMPTY_SITE_REVIEW_SUMMARY;
};
