export interface IWishlistService {
    getWishlist(): Promise<string[]>;
    addItem(gameId: string): Promise<void>;
    removeItem(gameId: string): Promise<void>;
    merge(gameIds: string[]): Promise<string[]>;
}
