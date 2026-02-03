import { injectable } from "inversify";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";
import container from "../inversify.config";
import type { IGameDetailsService } from "../iterfaces/i-game-details-service";
import type { GameDetailsResponse, GameReviewFilters, GameReviewsResponse, GameQuestionsResponse, ReviewPayload } from "../types/game-details-service";

@injectable()
export class GameDetailsService implements IGameDetailsService {
  private readonly _apiClient: IApiClient;

  constructor() {
    this._apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
  }

  async getGameDetails(slug: string): Promise<GameDetailsResponse> {
    const response = await this._apiClient.api.get(`/api/games/${slug}`);
    return response.data;
  }

  async getRecommendations(slug: string, limit = 8): Promise<{ items: GameDetailsResponse["recommendations"]["moreLikeThis"] }> {
    const response = await this._apiClient.api.get(`/api/games/${slug}/recommendations`, {
      params: { limit }
    });
    return response.data;
  }

  async getReviews(gameId: string, filters: GameReviewFilters): Promise<GameReviewsResponse> {
    const response = await this._apiClient.api.get(`/api/games/${gameId}/reviews`, { params: filters });
    return response.data;
  }

  async createReview(gameId: string, payload: ReviewPayload): Promise<void> {
    await this._apiClient.api.post(`/api/games/${gameId}/reviews`, payload);
  }

  async toggleHelpful(reviewId: string): Promise<{ helpful: boolean; count: number }> {
    const response = await this._apiClient.api.post(`/api/reviews/${reviewId}/helpful`);
    return response.data;
  }

  async reportReview(reviewId: string): Promise<void> {
    await this._apiClient.api.post(`/api/reviews/${reviewId}/report`);
  }

  async getQuestions(gameId: string, limit = 20): Promise<GameQuestionsResponse> {
    const response = await this._apiClient.api.get(`/api/games/${gameId}/questions`, { params: { limit } });
    return response.data;
  }

  async askQuestion(gameId: string, question: string): Promise<void> {
    await this._apiClient.api.post(`/api/games/${gameId}/questions`, { question });
  }

  async answerQuestion(questionId: string, text: string): Promise<void> {
    await this._apiClient.api.post(`/api/questions/${questionId}/answers`, { text });
  }

  async trackGameView(payload: { gameId: string; anonId?: string; userId?: string }): Promise<void> {
    await this._apiClient.api.post(`/api/tracking/game-view`, payload);
  }

  async trackMediaPlay(payload: { gameId: string; mediaId?: string; mediaType?: string; anonId?: string; userId?: string }): Promise<void> {
    await this._apiClient.api.post(`/api/tracking/game-play-media`, payload);
  }
}
