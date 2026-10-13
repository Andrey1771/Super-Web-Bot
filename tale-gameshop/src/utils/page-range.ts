export type PageItem = number | 'ellipsis';

/**
 * Номера страниц для пагинации: до семи страниц — все подряд, дальше — края и окно вокруг
 * текущей с многоточиями. Общая для заказов в аккаунте и отзывов на странице игры.
 */
export const buildPageRange = (current: number, total: number): PageItem[] => {
  if (total <= 1) {
    return [];
  }

  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  if (current <= 3) {
    return [1, 2, 3, 4, 'ellipsis', total - 1, total];
  }

  if (current >= total - 2) {
    return [1, 2, 'ellipsis', total - 3, total - 2, total - 1, total];
  }

  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total];
};
