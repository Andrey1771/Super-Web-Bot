import { useEffect, useRef } from "react";
import { analyticsClient } from "./analytics-client";

/**
 * Подборки товаров в аналитике: что показали и что из показанного выбрали.
 *
 * Без пары «показ списка → клик в списке» отчёты умеют сказать, какие игры открывали, но не
 * умеют — откуда на них пришли. Блок рекомендаций на странице игры, подборка на главной и
 * каталог выглядят одинаково: просмотры карточек есть, а вклад самого блока неизвестен, и
 * решить, что убрать со страницы, нечем.
 *
 * Имя списка задаётся в одном месте — константой ниже. Свободные строки на местах вызова
 * рано или поздно разъезжаются («Recommendations» и «recommendations» — уже два разных
 * списка в отчёте), а склеить их задним числом нельзя.
 */
/**
 * Вариант товара для GA: издание и регион ключа одной строкой.
 *
 * Один хелпер на все события корзины и покупки — сервер в purchase собирает подпись так же.
 * Разойтись им нельзя: в отчёте GA один товар назывался бы по-разному на разных шагах воронки.
 */
export const gaItemVariant = (item: { editionTitle?: string | null; offerTitle?: string | null }): string | undefined => {
    const variant = [item.editionTitle, item.offerTitle].filter(Boolean).join(' · ');
    return variant.length > 0 ? variant : undefined;
};

export const ITEM_LISTS = {
  catalog: "Catalog",
  deals: "Deals",
  homeMood: "Home — picked by mood",
  homeHero: "Home — hero billboard",
  recommendationsGame: "Recommendations — game page",
  recommendationsCart: "Recommendations — cart",
  recommendationsAccount: "Recommendations — account",
  wishlist: "Wishlist",
} as const;

export type ItemListName = (typeof ITEM_LISTS)[keyof typeof ITEM_LISTS];

/** Товар в подборке. Поля необязательные: разные списки знают о товаре разное. */
export type ListItemInput = {
  id?: string | null;
  title?: string | null;
  price?: number | null;
  category?: string | null;
};

/**
 * Сколько позиций уходит в одном событии. Каталог показывает больше, но смысла в длинном
 * хвосте нет: отчёты по спискам смотрят на первые позиции, а полный список раздувает запрос.
 */
const MAX_ITEMS = 20;

const toItems = (items: ListItemInput[]) =>
  items
    .filter((item) => item.id)
    .slice(0, MAX_ITEMS)
    .map((item, index) => ({
      item_id: String(item.id),
      item_name: item.title ?? "",
      ...(typeof item.price === "number" ? { price: item.price } : {}),
      ...(item.category ? { item_category: item.category } : {}),
      // Позиция в списке: по ней видно, кликают ли дальше первого ряда.
      index,
      quantity: 1,
    }));

/**
 * Показ подборки — один раз на её содержимое.
 *
 * Пока список пуст (данные ещё грузятся), событие не отправляется: пустая подборка ничего не
 * показала, и считать её показом значит утверждать, что покупатель видел то, чего не было.
 */
export const useItemListView = (
  listName: ItemListName,
  items: ListItemInput[],
  currency?: string,
) => {
  const sentSignature = useRef<string | null>(null);

  useEffect(() => {
    const ready = items.filter((item) => item.id);
    if (ready.length === 0) {
      return;
    }

    // Подпись содержимого: смена страницы каталога или фильтра — это новый показ,
    // а повторный рендер тем же составом — нет.
    const signature = `${listName}|${ready.map((item) => item.id).join(",")}`;
    if (sentSignature.current === signature) {
      return;
    }
    sentSignature.current = signature;

    analyticsClient.trackEcommerce("view_item_list", {
      ...(currency ? { currency } : {}),
      item_list_name: listName,
      items: toItems(ready),
    });
  }, [listName, items, currency]);
};

/** Клик по товару внутри подборки. Вызывается на месте перехода, до навигации. */
export const trackItemSelect = (
  listName: ItemListName,
  item: ListItemInput,
  index: number,
  currency?: string,
) => {
  if (!item.id) {
    return;
  }

  analyticsClient.trackEcommerce("select_item", {
    ...(currency ? { currency } : {}),
    item_list_name: listName,
    items: [
      {
        item_id: String(item.id),
        item_name: item.title ?? "",
        ...(typeof item.price === "number" ? { price: item.price } : {}),
        ...(item.category ? { item_category: item.category } : {}),
        index,
        quantity: 1,
      },
    ],
  });
};
