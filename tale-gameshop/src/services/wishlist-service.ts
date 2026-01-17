import { injectable } from 'inversify';
import IDENTIFIERS from '../constants/identifiers';
import container from '../inversify.config';
import type { IApiClient } from '../iterfaces/i-api-client';
import type { IWishlistService } from '../iterfaces/i-wishlist-service';
import type { Game } from '../models/game';

const API_URL = '/api/Wishlist';

@injectable()
export class WishlistService implements IWishlistService {
    private readonly _apiClient: IApiClient;

    constructor() {
        this._apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
    }

    async getWishlist(userId: string): Promise<Game[]> {
        const response = await this._apiClient.api.get(`${API_URL}/${userId}`);
        return response.data;
    }

    async addToWishlist(userId: string, gameId: string): Promise<void> {
        await this._apiClient.api.post(`${API_URL}/${userId}/items`, { gameId });
    }

    async removeFromWishlist(userId: string, gameId: string): Promise<void> {
        await this._apiClient.api.delete(`${API_URL}/${userId}/items/${gameId}`);
    }
}
