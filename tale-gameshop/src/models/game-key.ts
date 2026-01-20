import { Game } from './game';

export type GameKey = {
    game: Game | null;
    key: string;
    keyType: string;
    issuedAt: string;
    isActive: boolean;
};
