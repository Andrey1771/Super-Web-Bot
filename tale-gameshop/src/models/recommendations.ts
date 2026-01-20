import { Game } from './game';

export type RecommendationItem = {
    game: Game;
    reason?: string;
};

export type ViewedGameItem = {
    game: Game;
    lastViewedAt: string;
    viewCount: number;
    source?: string;
};
