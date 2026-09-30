import { apiClient } from "./client";

/**
 * Регион товара в корзине: где активируется ключ и подходит ли он покупателю.
 *
 * Запрашивается отдельно, а не хранится в позиции корзины. Корзина живёт в браузере неделями,
 * и записанный в неё регион устареет в тот же день, когда магазин поменяет политику игры, —
 * покупатель увидел бы одно, а на кассе получил другое.
 */
export type CartItemRegion = {
  gameId: string;
  /** false — игры больше нет в каталоге; про регион в этом случае ничего не утверждаем. */
  known: boolean;
  /** Короткая подпись для строки корзины. null — товар без ограничений. */
  badge: string | null;
  summary: string | null;
  exclusions: string | null;
  /** Вид сводки кодом (см. utils/region-text). null — товар без ограничений или старый ответ. */
  kind?: string | null;
  regionNames?: string[] | null;
  excludedCountries?: string[] | null;
  /** true/false — вердикт для страны покупателя, null — страна неизвестна. */
  allowed: boolean | null;
  /**
   * Где активируются доступные ключи: «Steam Key», «Epic Games»… Пусто — ключей на складе нет,
   * и площадку называть не из чего. Приходит со склада, а не из карточки игры: один тайтл
   * магазин может продавать ключами разных сторов.
   */
  platforms: string[];
  /** Есть ли ключи прямо сейчас — от этого зависит, «мгновенно» ли доставка. */
  inStock: boolean | null;
};

export type CartRegionResponse = {
  buyerCountry: string | null;
  items: CartItemRegion[];
};

export const checkCartRegions = async (gameIds: string[]): Promise<CartRegionResponse> => {
  if (gameIds.length === 0) {
    return { buyerCountry: null, items: [] };
  }
  const response = await apiClient().post("/api/storefront/region/check", { gameIds });
  return response.data ?? { buyerCountry: null, items: [] };
};
