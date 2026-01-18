import { RecommendationItem, ViewedGameItem } from '../models/recommendations';

export interface IRecommendationsService {
    getRecommendations(limit?: number): Promise<RecommendationItem[]>;
    getViewed(limit?: number): Promise<ViewedGameItem[]>;
    postViewed(gameId: string, source?: string): Promise<void>;
}
