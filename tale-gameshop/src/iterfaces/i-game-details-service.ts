import { GameDetailsViewModel } from '../models/game-details';

export interface IGameDetailsService {
    getGameDetailsBySlug(slug: string): Promise<GameDetailsViewModel>;
}
