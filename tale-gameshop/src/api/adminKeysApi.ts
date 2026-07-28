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
): Promise<{ added: number; skippedDuplicates: number; previouslyVoided: number; available: number }> =>
  (await api().post(`/api/admin/keys/inventory/${gameId}`, { keyType, keys })).data;

export const grantKey = async (
  gameId: string,
  userId: string,
  keyType?: string
): Promise<GrantResult> =>
  (await api().post('/api/admin/keys/grant', { gameId, userId, keyType })).data;

export interface GameKeyListItem {
  id: string;
  key: string;
  masked: boolean;
  keyType: string;
  status: 'Pool' | 'Delivered' | 'Voided';
  ownerEmail?: string | null;
  issuedAt?: string | null;
}

export interface GameKeyPage {
  items: GameKeyListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export const listKeys = async (
  gameId: string,
  opts: { query?: string; status?: string; page?: number; pageSize?: number } = {}
): Promise<GameKeyPage> => {
  const params = new URLSearchParams();
  if (opts.query) params.set('query', opts.query);
  if (opts.status && opts.status !== 'all') params.set('status', opts.status);
  params.set('page', String(opts.page ?? 1));
  params.set('pageSize', String(opts.pageSize ?? 25));
  return (await api().get(`/api/admin/keys/inventory/${gameId}/list?${params.toString()}`)).data;
};

export interface KeyOverviewRow {
  gameId: string;
  title: string;
  available: number;
  delivered: number;
  voided: number;
  awaiting: number;
  outOfStock: boolean;
  low: boolean;
}

export interface KeyOverview {
  totals: { games: number; available: number; delivered: number; awaiting: number; outOfStock: number; lowStock: number };
  lowThreshold: number;
  games: KeyOverviewRow[];
}

export const getKeyOverview = async (lowThreshold = 5): Promise<KeyOverview> =>
  (await api().get(`/api/admin/keys/overview?lowThreshold=${lowThreshold}`)).data;

export interface OwedLine {
  orderNumber: string;
  buyerEmail: string;
  gameId: string;
  gameTitle: string;
  remaining: number;
  createdAt: string;
}

export interface OwedList {
  total: number;
  lines: OwedLine[];
}

export const getOwedKeys = async (): Promise<OwedList> =>
  (await api().get('/api/admin/keys/owed')).data;

export const voidKey = async (gameId: string, keyId: string): Promise<void> => {
  await api().post(`/api/admin/keys/inventory/${gameId}/keys/${keyId}/void`);
};

export const purgeKey = async (gameId: string, keyId: string): Promise<void> => {
  await api().delete(`/api/admin/keys/inventory/${gameId}/keys/${keyId}`);
};

export const editKey = async (
  gameId: string,
  keyId: string,
  body: { key?: string; keyType?: string }
): Promise<void> => {
  await api().put(`/api/admin/keys/inventory/${gameId}/keys/${keyId}`, body);
};
