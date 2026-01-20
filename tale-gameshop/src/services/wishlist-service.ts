import { injectable } from 'inversify';
import IDENTIFIERS from '../constants/identifiers';
import container from '../inversify.config';
import type { IApiClient } from '../iterfaces/i-api-client';
import type { IWishlistService } from '../iterfaces/i-wishlist-service';
const API_URL = '/api/wishlist';

@injectable()
export class WishlistService implements IWishlistService {
    private readonly _apiClient: IApiClient;

    constructor() {
        this._apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
    }

    async getWishlist(): Promise<string[]> {
        const response = await this._apiClient.api.get(API_URL);
        return response.data as string[];
    }

    async addItem(gameId: string): Promise<void> {
        await this._apiClient.api.post(`${API_URL}/items`, { gameId });
    }

    async removeItem(gameId: string): Promise<void> {
        await this._apiClient.api.delete(`${API_URL}/items/${gameId}`);
    }

    async merge(gameIds: string[]): Promise<string[]> {
        const response = await this._apiClient.api.post(`${API_URL}/merge`, { gameIds });
        return response.data?.gameIds ?? [];
    }
}
