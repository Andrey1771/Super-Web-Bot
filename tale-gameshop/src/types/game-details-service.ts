import type { GameDetailsResponse, Review, QAItem } from "./game-details";

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

export interface ReviewPayload {
  rating: number;
  playtimeHours?: number;
  text: string;
  recommend: boolean;
  images?: { url: string; thumbUrl: string }[];
}

export interface GameQuestionsResponse {
  items: QAItem[];
}

export type { GameDetailsResponse };
