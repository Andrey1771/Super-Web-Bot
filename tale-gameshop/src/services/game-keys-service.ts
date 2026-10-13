import { injectable } from 'inversify';
import type { IApiClient } from '../iterfaces/i-api-client';
import type { IGameKeysService } from '../iterfaces/i-game-keys-service';
import IDENTIFIERS from '../constants/identifiers';
import container from '../inversify.config';
import { GameKey } from '../models/game-key';

const API_URL = '/api/users/me/keys';

@injectable()
export class GameKeysService implements IGameKeysService {
    private readonly _apiClient: IApiClient;

    constructor() {
        this._apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
    }

    async getKeys(limit = 20): Promise<GameKey[]> {
        const response = await this._apiClient.api.get(API_URL, {
            params: { limit }
        });
        return response.data;
    }
}
