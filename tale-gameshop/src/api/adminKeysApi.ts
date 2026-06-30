import container from '../inversify.config';
import IDENTIFIERS from '../constants/identifiers';
import type { IApiClient } from '../iterfaces/i-api-client';

const api = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

export interface KeyInventory {
  gameId: string;
  available: number;
  assigned: number;
}

export interface GrantResult {
  granted: boolean;
  key?: string;
  keyType?: string;
  message?: string;
}

export const getKeyInventory = async (gameId: string): Promise<KeyInventory> =>
  (await api().get(`/api/admin/keys/inventory/${gameId}`)).data;

export const addKeysToInventory = async (
  gameId: string,
  keyType: string,
  keys: string[]
): Promise<{ added: number; available: number }> =>
  (await api().post(`/api/admin/keys/inventory/${gameId}`, { keyType, keys })).data;

export const grantKey = async (
  gameId: string,
  userId: string,
  keyType?: string
): Promise<GrantResult> =>
  (await api().post('/api/admin/keys/grant', { gameId, userId, keyType })).data;
