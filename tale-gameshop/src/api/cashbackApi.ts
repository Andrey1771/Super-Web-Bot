import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";

const apiClient = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

export interface CashbackTier {
  name: string;
  minLifetimeSpent: number;
  ratePercent: number;
}

export interface CashbackTiersResponse {
  enabled: boolean;
  pointToCurrency: number;
  minRedeemPoints: number;
  maxRedeemPercentOfOrder: number;
  tiers: CashbackTier[];
}

export interface CashbackNextTier {
  name: string;
  ratePercent: number;
  threshold: number;
  amountToNext: number;
}

export type CashbackHistoryType = "Earn" | "Redeem" | "Reverse";

export interface CashbackHistoryItem {
  id: string;
  orderId?: string | null;
  type: CashbackHistoryType;
  amount: number;
  balanceAfter: number;
  note?: string | null;
  createdAt: string;
}

export interface CashbackAccount {
  enabled: boolean;
  pointToCurrency: number;
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  progressPercent: number;
  currentTier: { name: string; ratePercent: number };
  nextTier: CashbackNextTier | null;
  history: CashbackHistoryItem[];
}

/** Кошелёк текущего пользователя (требует авторизации). */
export const getCashbackAccount = async (): Promise<CashbackAccount> => {
  const response = await apiClient().get("/api/account/cashback");
  return response.data as CashbackAccount;
};

/** Публичные тиры/ставки программы — для страницы /rewards. */
export const getCashbackTiers = async (): Promise<CashbackTiersResponse> => {
  const response = await apiClient().get("/api/cashback/tiers");
  return response.data as CashbackTiersResponse;
};
