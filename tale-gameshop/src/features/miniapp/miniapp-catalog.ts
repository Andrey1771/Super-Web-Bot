/**
 * Каталог для Telegram Mini App — тот же серверный каталог, что у витрины: игры и ПО, без черновиков.
 * Прежний адрес /api/game (весь список одним ответом) убран вместе со старым контроллером, и приложение
 * показывало «не удалось загрузить каталог», хотя сервер был жив.
 */
export const MINIAPP_CATALOG_URL = '/api/game/catalog?kind=all&pageSize=48';

export type MiniAppGame = {
    id: string;
    name: string;
    title: string;
    imagePath?: string;
    description?: string;
    price: number;
    finalPrice?: number;
    discountActive?: boolean;
    discountPercent?: number;
    genres?: string[];
    /** Валюта цены. Не доллары — звёздами такую игру не продать, сервер откажет. */
    currency?: string;
    /** Статус релиза считает сервер; невышедшие показываем, но не продаём (бэкенд всё равно откажет). */
    isComingSoon?: boolean;
    releaseDate?: string;
};

type CatalogCard = Partial<MiniAppGame> & { category?: string | null; genres?: string[] | null };

/**
 * Ответ каталога (`{ items: [...] }`) или старый плоский список → игры Mini App. Жанр у карточки каталога приходит
 * одной строкой (category), приложению нужен список; карточки без id не показываем — их некуда вести.
 */
export const toMiniAppGames = (payload: unknown): MiniAppGame[] => {
    const items = Array.isArray(payload) ? payload : ((payload as { items?: unknown[] } | null)?.items ?? []);
    return items
        .map((raw) => raw as CatalogCard)
        .filter((card) => typeof card.id === 'string' && card.id.length > 0)
        .map((card) => ({
            ...card,
            id: card.id as string,
            name: card.name ?? card.title ?? '',
            title: card.title ?? card.name ?? '',
            price: Number(card.price ?? 0),
            genres: card.genres && card.genres.length > 0 ? card.genres : card.category ? [card.category] : [],
        }));
};
