import { injectable } from "inversify";
import IDENTIFIERS from "../constants/identifiers";
import container from "../inversify.config";
import type { IApiClient } from "../iterfaces/i-api-client";
import type { IAdminGameDiscountsService } from "../iterfaces/i-admin-game-discounts-service";
import type {
  AdminGameDiscountPage,
  AdminGameDiscountRow,
  BulkUpsertGameDiscountPayload,
  UpsertGameDiscountPayload
} from "../types/admin-game-discounts";

@injectable()
export class AdminGameDiscountsService implements IAdminGameDiscountsService {
  private readonly apiClient: IApiClient;

  constructor() {
    this.apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
  }

  async getPage(options: {
    search?: string;
    status?: string;
    sortBy?: string;
    desc?: boolean;
    skip: number;
    take: number;
  }): Promise<AdminGameDiscountPage> {
    const response = await this.apiClient.api.get("/api/admin/games/discounts", {
      params: {
        search: options.search?.trim() || undefined,
        status: options.status && options.status !== "all" ? options.status : undefined,
        sortBy: options.sortBy || "title",
        desc: options.desc ? true : undefined,
        skip: options.skip,
        take: options.take,
      },
    });
    return response.data as AdminGameDiscountPage;
  }

  async upsert(gameId: string, payload: UpsertGameDiscountPayload): Promise<void> {
    await this.apiClient.api.put(`/api/admin/games/${encodeURIComponent(gameId)}/discount`, payload);
  }

  async remove(gameId: string): Promise<void> {
    await this.apiClient.api.delete(`/api/admin/games/${encodeURIComponent(gameId)}/discount`);
  }

  async bulkUpsert(payload: BulkUpsertGameDiscountPayload): Promise<void> {
    await this.apiClient.api.post("/api/admin/games/discounts/bulk-upsert", payload);
  }

  async bulkClear(gameIds: string[]): Promise<void> {
    await this.apiClient.api.post("/api/admin/games/discounts/bulk-clear", { gameIds });
  }
}
