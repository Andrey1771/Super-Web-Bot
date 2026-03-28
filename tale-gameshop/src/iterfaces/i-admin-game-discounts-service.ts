import type {
  AdminGameDiscountRow,
  BulkUpsertGameDiscountPayload,
  UpsertGameDiscountPayload
} from "../types/admin-game-discounts";

export interface IAdminGameDiscountsService {
  getAll(search?: string): Promise<AdminGameDiscountRow[]>;
  upsert(gameId: string, payload: UpsertGameDiscountPayload): Promise<void>;
  remove(gameId: string): Promise<void>;
  bulkUpsert(payload: BulkUpsertGameDiscountPayload): Promise<void>;
  bulkClear(gameIds: string[]): Promise<void>;
}
