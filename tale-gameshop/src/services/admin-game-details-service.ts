import { injectable } from "inversify";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";
import container from "../inversify.config";
import type { IAdminGameDetailsService } from "../iterfaces/i-admin-game-details-service";
import type { AdminGameDiscount, GameDetails } from "../types/game-details";

@injectable()
export class AdminGameDetailsService implements IAdminGameDetailsService {
  private readonly _apiClient: IApiClient;

  constructor() {
    this._apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
  }

  async getGameDetails(id: string): Promise<GameDetails> {
    const response = await this._apiClient.api.get(`/api/admin/games/${id}/details`);
    return response.data;
  }

  async updateDetails(id: string, payload: GameDetails): Promise<GameDetails> {
    const response = await this._apiClient.api.put(`/api/admin/games/${id}/details`, payload);
    return response.data;
  }

  async updateMedia(id: string, payload: { cover?: GameDetails["cover"]; gallery: GameDetails["gallery"] }): Promise<GameDetails> {
    const response = await this._apiClient.api.put(`/api/admin/games/${id}/media`, payload);
    return response.data;
  }

  async updatePricing(id: string, payload: {
    basePrice: number;
    discountPercent?: number;
    finalPrice: number;
    currency: string;
    keyType: string;
    isActive: boolean;
    isNew: boolean;
    isTopRated: boolean;
  }): Promise<GameDetails> {
    const response = await this._apiClient.api.put(`/api/admin/games/${id}/pricing`, payload);
    return response.data;
  }

  async updateEditions(id: string, editions: GameDetails["editions"]): Promise<GameDetails> {
    const response = await this._apiClient.api.put(`/api/admin/games/${id}/editions`, editions);
    return response.data;
  }

  async updateDlc(id: string, dlcItems: GameDetails["dlcItems"]): Promise<GameDetails> {
    const response = await this._apiClient.api.put(`/api/admin/games/${id}/dlc`, dlcItems);
    return response.data;
  }

  async updateRequirements(id: string, requirements: GameDetails["systemRequirements"]): Promise<GameDetails> {
    const response = await this._apiClient.api.put(`/api/admin/games/${id}/requirements`, requirements);
    return response.data;
  }

  async updateAwards(id: string, awards: GameDetails["awards"]): Promise<GameDetails> {
    const response = await this._apiClient.api.put(`/api/admin/games/${id}/awards`, awards);
    return response.data;
  }

  async updateRecommendations(id: string, payload: { similarGameIds: string[]; autoRecommendRules: GameDetails["autoRecommendRules"] }): Promise<GameDetails> {
    const response = await this._apiClient.api.put(`/api/admin/games/${id}/recommendations`, payload);
    return response.data;
  }


  async getDiscount(id: string): Promise<AdminGameDiscount> {
    const response = await this._apiClient.api.get(`/api/admin/games/${id}/discount`);
    return response.data;
  }

  async upsertDiscount(id: string, payload: { discountPercent: number; startDate: string; endDate: string }): Promise<AdminGameDiscount> {
    const response = await this._apiClient.api.put(`/api/admin/games/${id}/discount`, payload);
    return response.data;
  }

  async deleteDiscount(id: string): Promise<void> {
    await this._apiClient.api.delete(`/api/admin/games/${id}/discount`);
  }
}
