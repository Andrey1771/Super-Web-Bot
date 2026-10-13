import type { GameDetailsResponse, Review } from "./game-details";

export interface GameReviewFilters {
  sort?: string;
  rating?: number;
  withPlaytime?: boolean;
  withImages?: boolean;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface GameReviewsResponse {
  items: Review[];
  total: number;
}

/** Причина жалобы — имя серверного enum ReviewReportReason. */
export type ReviewReportReason = 'Spam' | 'Abusive' | 'OffTopic' | 'PersonalData' | 'Malware' | 'Other';

export interface ReviewReportPayload {
  reason: ReviewReportReason;
  comment?: string;
}

/** Ответ на жалобу: hidden — отзыв ушёл с витрины (порог жалоб или тяжёлая причина). */
export interface ReviewReportResult {
  reported: boolean;
  hidden: boolean;
  reports: number;
}

export interface ReviewPayload {
  rating: number;
  playtimeHours?: number;
  text: string;
  images?: { url: string; thumbUrl: string }[];
}

export type { GameDetailsResponse };
