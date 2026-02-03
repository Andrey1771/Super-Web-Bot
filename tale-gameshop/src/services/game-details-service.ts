import { GameDetailsViewModel } from '../types/game-details';
import { gameDetailsMock } from './game-details.mock';

export interface IGameDetailsService {
  getGameDetails: (slug: string) => Promise<GameDetailsViewModel>;
}

export const gameDetailsService: IGameDetailsService = {
  async getGameDetails(slug: string): Promise<GameDetailsViewModel> {
    if (slug && slug !== gameDetailsMock.game.slug) {
      return {
        ...gameDetailsMock,
        game: {
          ...gameDetailsMock.game,
          slug,
          title: `${gameDetailsMock.game.title} (${slug.replace(/-/g, ' ')})`
        }
      };
    }
    return gameDetailsMock;
  }
};
