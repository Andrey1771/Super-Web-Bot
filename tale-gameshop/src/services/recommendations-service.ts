import { injectable } from 'inversify';
import type { IRecommendationsService } from '../iterfaces/i-recommendations-service';
import type { IApiClient } from '../iterfaces/i-api-client';
import IDENTIFIERS from '../constants/identifiers';
import container from '../inversify.config';
import { RecommendationItem, ViewedGameItem } from '../models/recommendations';

const API_URL = '/api/users/me';

@injectable()
export class RecommendationsService implements IRecommendationsService {
    private readonly _apiClient: IApiClient;

    constructor() {
        this._apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
    }

    async getRecommendations(limit = 8): Promise<RecommendationItem[]> {
        const response = await this._apiClient.api.get(`${API_URL}/recommendations`, {
            params: { limit }
        });
        return response.data;
    }

    async getViewed(limit = 8): Promise<ViewedGameItem[]> {
        const response = await this._apiClient.api.get(`${API_URL}/viewed`, {
            params: { limit }
        });
        return response.data;
    }

    async postViewed(gameId: string, source?: string): Promise<void> {
        if (!gameId) {
            return;
        }

        await this._apiClient.api.post(`${API_URL}/viewed/${gameId}`, {
            source
        });
    }
}
