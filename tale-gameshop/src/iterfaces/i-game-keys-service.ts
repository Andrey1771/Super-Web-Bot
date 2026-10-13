import { GameKey } from '../models/game-key';

export interface IGameKeysService {
    getKeys(limit?: number): Promise<GameKey[]>;
}
