import type { AdminGameDiscount, GameDetails } from "../types/game-details";


export interface IAdminGameDetailsService {
  getGameDetails: (id: string) => Promise<GameDetails>;
  updateDetails: (id: string, payload: GameDetails) => Promise<GameDetails>;
  updateMedia: (id: string, payload: { cover?: GameDetails["cover"]; gallery: GameDetails["gallery"] }) => Promise<GameDetails>;
  updatePricing: (id: string, payload: {
    basePrice: number;
    discountPercent?: number;
    finalPrice: number;
    currency: string;
    keyType: string;
    isActive: boolean;
    isNew: boolean;
    isTopRated: boolean;
  }) => Promise<GameDetails>;
  updateEditions: (id: string, editions: GameDetails["editions"]) => Promise<GameDetails>;
  updateDlc: (id: string, dlcItems: GameDetails["dlcItems"]) => Promise<GameDetails>;
  updateRequirements: (id: string, requirements: GameDetails["systemRequirements"]) => Promise<GameDetails>;
  updateAwards: (id: string, awards: GameDetails["awards"]) => Promise<GameDetails>;
  updateRecommendations: (id: string, payload: { similarGameIds: string[]; autoRecommendRules: GameDetails["autoRecommendRules"] }) => Promise<GameDetails>;
  getDiscount: (id: string) => Promise<AdminGameDiscount>;
  upsertDiscount: (id: string, payload: { discountPercent: number; startDate: string; endDate: string }) => Promise<AdminGameDiscount>;
  deleteDiscount: (id: string) => Promise<void>;
}
