import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";

const apiClient = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

export interface TelegramLinkStatus {
  linked: boolean;
  username?: string | null;
  telegramUserId?: number;
  linkedAt?: string;
}

export interface TelegramLinkToken {
  deepLink: string;
  botUsername: string;
  expiresAt: string;
}

export const getTelegramStatus = async (): Promise<TelegramLinkStatus> => {
  const response = await apiClient().get("/api/account/telegram/status");
  return response.data as TelegramLinkStatus;
};

export const createTelegramLinkToken = async (): Promise<TelegramLinkToken> => {
  const response = await apiClient().post("/api/account/telegram/link-token");
  return response.data as TelegramLinkToken;
};

export const unlinkTelegram = async (): Promise<void> => {
  await apiClient().delete("/api/account/telegram");
};
