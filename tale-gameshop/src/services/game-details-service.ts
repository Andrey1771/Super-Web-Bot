import { injectable } from 'inversify';
import type { IApiClient } from '../iterfaces/i-api-client';
import type { IGameDetailsService } from '../iterfaces/i-game-details-service';
import type { GameDetailsViewModel } from '../models/game-details';
import IDENTIFIERS from '../constants/identifiers';
import container from '../inversify.config';
import { gameDetailsMock } from './game-details.mock';

const API_URL = '/api/GameDetails';

@injectable()
export class GameDetailsService implements IGameDetailsService {
    private readonly _apiClient: IApiClient;

    constructor() {
        this._apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
    }

    async getGameDetailsBySlug(slug: string): Promise<GameDetailsViewModel> {
        try {
            const response = await this._apiClient.api.get(`${API_URL}/${slug}`);
            return response.data as GameDetailsViewModel;
        } catch (error) {
            console.warn('Falling back to mock game details data.', error);
            return gameDetailsMock;
        }
    }
}
