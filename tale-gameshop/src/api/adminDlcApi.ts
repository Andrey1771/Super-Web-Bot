import container from '../inversify.config';
import IDENTIFIERS from '../constants/identifiers';
import type { IApiClient } from '../iterfaces/i-api-client';

const api = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

/** DLC игры в списке редактора: и черновики, и опубликованные. */
export interface AdminDlcRow {
  id: string;
  slug: string;
  title: string;
  imagePath: string;
  price: number;
  currency: string;
  isDraft: boolean;
  isComingSoon: boolean;
  keysAvailable: number;
  releaseDate: string;
}

export interface AdminGameDlc {
  kind: 'Game' | 'Software';
  /** Если открытый товар сам DLC — его базовая игра. */
  parent: { id: string; title: string; slug: string } | null;
  items: AdminDlcRow[];
}

export const getGameDlc = async (gameId: string): Promise<AdminGameDlc> =>
  (await api().get(`/api/admin/games/${gameId}/dlc`)).data as AdminGameDlc;

/** Новое DLC черновиком: жанр и валюта — от игры, адрес — уникальный. */
export const createGameDlc = async (gameId: string, name: string, price: number): Promise<{ id: string; slug: string; title: string }> =>
  (await api().post(`/api/admin/games/${gameId}/dlc`, { name, price })).data;

/** Сделать товар дополнением игры (в том числе перенести DLC от другой игры). */
export const attachGameDlc = async (gameId: string, dlcId: string): Promise<void> => {
  await api().put(`/api/admin/games/${gameId}/dlc/${dlcId}`);
};

/** Отвязать: дополнение становится самостоятельной игрой. */
export const detachGameDlc = async (gameId: string, dlcId: string): Promise<void> => {
  await api().delete(`/api/admin/games/${gameId}/dlc/${dlcId}`);
};

/** Быстрая правка DLC из списка игры: меняются и товар, и его карточка. */
export const quickEditGameDlc = async (
  gameId: string,
  dlcId: string,
  patch: { title?: string; price?: number; releaseDate?: string; isDraft?: boolean }
): Promise<void> => {
  await api().patch(`/api/admin/games/${gameId}/dlc/${dlcId}`, patch);
};

/** Удалить DLC совсем — тот же запрос, что у кнопки Delete в каталоге. */
export const deleteDlcProduct = async (dlcId: string): Promise<void> => {
  await api().delete(`/api/game/${dlcId}`);
};
