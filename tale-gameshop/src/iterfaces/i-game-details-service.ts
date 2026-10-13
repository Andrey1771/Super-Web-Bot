import type { GameDetailsResponse, GameReviewFilters, GameReviewsResponse, ReviewPayload, ReviewReportPayload, ReviewReportResult } from "../types/game-details-service";

export interface IGameDetailsService {
  getGameDetails: (slug: string, currency?: string) => Promise<GameDetailsResponse>;
  getRecommendations: (slug: string, limit?: number) => Promise<{ items: GameDetailsResponse["recommendations"]["moreLikeThis"] } >;
  getReviews: (gameId: string, filters: GameReviewFilters) => Promise<GameReviewsResponse>;
  createReview: (gameId: string, payload: ReviewPayload) => Promise<void>;
  updateReview: (reviewId: string, payload: ReviewPayload) => Promise<void>;
  toggleHelpful: (reviewId: string) => Promise<{ helpful: boolean; count: number }>;
  reportReview: (reviewId: string, payload: ReviewReportPayload) => Promise<ReviewReportResult>;
  trackGameView: (payload: { gameId: string; anonId?: string; userId?: string }) => Promise<void>;
  trackMediaPlay: (payload: { gameId: string; mediaId?: string; mediaType?: string; anonId?: string; userId?: string }) => Promise<void>;
}
