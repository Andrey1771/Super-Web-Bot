import type { GameDetailsResponse, GameReviewFilters, GameReviewsResponse, GameQuestionsResponse, ReviewPayload } from "../types/game-details-service";

export interface IGameDetailsService {
  getGameDetails: (slug: string) => Promise<GameDetailsResponse>;
  getRecommendations: (slug: string, limit?: number) => Promise<{ items: GameDetailsResponse["recommendations"]["moreLikeThis"] } >;
  getReviews: (gameId: string, filters: GameReviewFilters) => Promise<GameReviewsResponse>;
  createReview: (gameId: string, payload: ReviewPayload) => Promise<void>;
  toggleHelpful: (reviewId: string) => Promise<{ helpful: boolean; count: number }>;
  reportReview: (reviewId: string) => Promise<void>;
  getQuestions: (gameId: string, limit?: number) => Promise<GameQuestionsResponse>;
  askQuestion: (gameId: string, question: string) => Promise<void>;
  answerQuestion: (questionId: string, text: string) => Promise<void>;
  trackGameView: (payload: { gameId: string; anonId?: string; userId?: string }) => Promise<void>;
  trackMediaPlay: (payload: { gameId: string; mediaId?: string; mediaType?: string; anonId?: string; userId?: string }) => Promise<void>;
}
