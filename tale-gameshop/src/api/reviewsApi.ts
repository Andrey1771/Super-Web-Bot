import { EMPTY_ABOUT_STATS } from "../utils/about-stats";
import type { AboutStats } from "../utils/about-stats";
import { apiClient } from "./client";

export type SiteReviewQuote = {
  author: string;
  rating: number;
  text: string;
  verifiedPurchase: boolean;
  createdAt: string;
  gameTitle: string | null;
  gameSlug: string | null;
  /** Аватар автора. Пусто или битая ссылка — кружок покажет первую букву имени. */
  avatarUrl: string | null;
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

/** Человек в разделе «Meet the team». Список задаётся в админке и по умолчанию пуст. */
export type AboutTeamMember = {
  name: string;
  role: string;
  description: string;
  badge: string;
  /** Фотография из медиатеки. Пусто — карточка покажет первую букву имени. */
  photoUrl: string;
};

/**
 * Люди на странице «О нас». Отдельным запросом от цифр: цифры кэшируются на десять минут,
 * а правку команды в админке хочется увидеть сразу.
 */
export const getAboutTeam = async (): Promise<AboutTeamMember[]> => {
  const response = await apiClient().get("/api/about/team");
  return Array.isArray(response.data) ? response.data : [];
};

/**
 * Цифры страницы «О нас»: каталог, выданные ключи, страны, скорость поддержки.
 * Живут рядом с отзывами, потому что это тот же жанр — факты о магазине, которые
 * считает сервер, а не разметка.
 */
export const getAboutStats = async (): Promise<AboutStats> => {
  const response = await apiClient().get("/api/about/stats");
  return response.data ?? EMPTY_ABOUT_STATS;
};

/**
 * «Больше не звать меня писать отзывы» по ссылке из письма.
 * POST, а не переход по ссылке: почтовые клиенты открывают ссылки заранее, и на GET
 * отписка срабатывала бы без ведома человека.
 */
export const unsubscribeReviewInvites = async (token: string): Promise<void> => {
  await apiClient().post("/api/reviews/invites/unsubscribe", { token });
};

export const getSiteReviewSummary = async (): Promise<SiteReviewSummary> => {
  const response = await apiClient().get("/api/reviews/summary");
  return response.data ?? EMPTY_SITE_REVIEW_SUMMARY;
};
