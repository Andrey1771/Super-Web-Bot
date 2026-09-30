import type {
  AdminGameDiscountPage,
  AdminGameDiscountRow,
  BulkUpsertGameDiscountPayload,
  UpsertGameDiscountPayload
} from "../types/admin-game-discounts";

export interface IAdminGameDiscountsService {

  /** Окно строк с сервера: поиск, срез по статусу, сортировка и границы окна — там же. */
  getPage(options: {
    search?: string;
    status?: string;
    sortBy?: string;
    desc?: boolean;
    skip: number;
    take: number;
  }): Promise<AdminGameDiscountPage>;
  upsert(gameId: string, payload: UpsertGameDiscountPayload): Promise<void>;
  remove(gameId: string): Promise<void>;
  bulkUpsert(payload: BulkUpsertGameDiscountPayload): Promise<void>;
  bulkClear(gameIds: string[]): Promise<void>;
}
