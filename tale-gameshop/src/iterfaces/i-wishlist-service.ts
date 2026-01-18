import { Game } from '../models/game';

export interface IWishlistService {
    getWishlist(userId: string): Promise<Game[]>;
    addToWishlist(userId: string, gameId: string): Promise<void>;
    removeFromWishlist(userId: string, gameId: string): Promise<void>;
}
