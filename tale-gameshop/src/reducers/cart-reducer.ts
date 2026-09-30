import IDENTIFIERS from "../constants/identifiers";
import container from "../inversify.config";
import { IApiClient } from "../iterfaces/i-api-client";
import {IKeycloakService} from "../iterfaces/i-keycloak-service";

export interface Product {
    gameId: string;
    name: string;
    /**
     * Адрес карточки товара. Ссылка из корзины строится по нему через productHref, а не из названия:
     * у товара с адресом, заданным админом, ссылка из названия открывала пустую заготовку карточки.
     * Необязательный — у позиций, сохранённых раньше, его нет.
     */
    slug?: string;
    price: number;
    quantity: number;
    image: string;
    /**
     * Издание (Standard / Deluxe …), если у игры их несколько. Позиция корзины — игра + издание:
     * у Standard и Deluxe разные цены и разные ключи, чекаут и выдача это учитывают.
     */
    editionCode?: string;
    editionTitle?: string;
    /**
     * Региональный вариант ключа: где он активируется. Как и издание, входит в ключ позиции —
     * европейский и глобальный ключ одной игры стоят по-разному и берутся из разных групп
     * склада, поэтому в корзине это две отдельные строки, а не одна с количеством два.
     */
    offerKey?: string;
    offerTitle?: string;
    /**
     * Жанр или тип товара — нужен только аналитике: в отчётах это разрез «что покупают».
     * Необязательный: место, которое его не знает, просто не передаёт.
     */
    category?: string;
}

/**
 * Ключ позиции корзины: игра + издание + региональный вариант.
 *
 * Хвосты добавляются только когда есть что добавлять: у игры без изданий и без региональных
 * вариантов ключ остаётся прежним «gameId», и корзины, сохранённые до появления вариантов,
 * продолжают работать без переноса.
 */
export const cartLineKey = (item: { gameId: string; editionCode?: string | null; offerKey?: string | null }) => {
    const edition = item.editionCode ? `::${item.editionCode}` : '';
    const offer = item.offerKey ? `::@${item.offerKey}` : '';
    return `${item.gameId}${edition}${offer}`;
};

/** Позиция совпадает с ключом: полный ключ «игра::издание» или просто gameId для позиции без издания. */
const matchesLine = (item: { gameId: string; editionCode?: string | null; offerKey?: string | null }, key: string) => cartLineKey(item) === key;

export interface CartState {
    items: Product[];
    /**
     * Валюта, в которой лежат цены позиций. Нужна, чтобы заметить смену валюты:
     * цены в корзине сохраняются локально, и без этой отметки евро легли бы поверх
     * долларов, а покупатель увидел бы сумму, которой не существует.
     * Пусто у корзин, сохранённых до мультивалютности.
     */
    currency?: string;
}

export type CartAction =
    /** meta.origin — кнопка или карточка, от которой к корзине летит обложка (см. cart-flight.ts); без неё берётся элемент в фокусе. */
    | { type: 'ADD_TO_CART'; payload: Product; meta?: { origin?: Element | null } }
    | { type: 'REMOVE_FROM_CART'; payload: string }
    | { type: 'INCREASE_QUANTITY'; payload: string }
    | { type: 'DECREASE_QUANTITY'; payload: string }
    | { type: 'SET_CART'; payload: Product[] }
    /** Валюта сменилась: цены позиций устарели и должны приехать заново с сервера. */
    | { type: 'SET_CURRENCY'; payload: string }
    /**
     * Цены пришли с сервера: ключ позиции → цена. Отдельное действие, а не замена всего
     * списка, потому что ответы приходят по одному. Замена целиком строится из состояния на
     * момент отправки запроса, и вторая пришедшая цена затирала первую — в корзине оставался
     * ровно один товар с ценой, остальные показывали ноль.
     */
    | { type: 'SET_ITEM_PRICES'; payload: Record<string, number> }
    | { type: 'CLEAR_CART' };

export const initialState: CartState = {
    items: [],
};

// Функция синхронизации корзины с сервером
const syncCartWithServer = async (userId: string, state: CartState) => {
    try {
        const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);

        // Отправляем объединённую корзину на сервер
        await apiClient.api.post(`/api/cart/${userId}`, {
            userId: userId,
            cartGames: state.items.map(product => ({
                gameId: product.gameId,
                name: product.name,
                price: product.price,
                quantity: product.quantity,
                image: product.image,
                editionCode: product.editionCode,
                editionTitle: product.editionTitle,
                offerKey: product.offerKey,
                offerTitle: product.offerTitle
            }))
        });
    } catch (error) {
        console.error('Failed to sync cart with server:', error);
    }
};

export const cartReducer = (state: CartState, action: CartAction): CartState => {
    const execute = () : CartState => {
        switch (action.type) {
            case 'ADD_TO_CART':
                const lineKey = cartLineKey(action.payload);
                const existingItem = state.items.find((item) => matchesLine(item, lineKey));
                if (existingItem) {
                    return {
                        ...state,
                        items: state.items.map((item) =>
                            matchesLine(item, lineKey)
                                ? { ...item, quantity: item.quantity + 1 }
                                : item
                        ),
                    };
                }
                return { ...state, items: [...state.items, { ...action.payload, quantity: 1 }] };

            case 'REMOVE_FROM_CART':
                return {
                    ...state,
                    items: state.items.filter((item) => !matchesLine(item, action.payload)),
                };

            case 'INCREASE_QUANTITY':
                return {
                    ...state,
                    items: state.items.map((item) =>
                        matchesLine(item, action.payload)
                            ? { ...item, quantity: item.quantity + 1 }
                            : item
                    ),
                };

            case 'DECREASE_QUANTITY':
                return {
                    ...state,
                    items: state.items
                        .map((item) =>
                            matchesLine(item, action.payload) && item.quantity > 1
                                ? { ...item, quantity: item.quantity - 1 }
                                : item
                        )
                        .filter((item) => item.quantity > 0), // Удаляем товары с количеством 0
                };

            case 'SET_CART':
                return { ...state, items: action.payload };

            case 'SET_CURRENCY': {
                if (state.currency === action.payload) {
                    return state;
                }

                // Цены позиций выражены в прежней валюте — обнуляем их, а не пересчитываем:
                // курса на фронте нет и быть не должно, актуальные цены придут с сервера
                // (корзина перезапрашивает товары, а итог всё равно считает чекаут).
                return {
                    ...state,
                    currency: action.payload,
                    items: state.items.map((item) => ({ ...item, price: 0 })),
                };
            }

            case 'SET_ITEM_PRICES': {
                const prices = action.payload;
                if (!prices || Object.keys(prices).length === 0) {
                    return state;
                }
                return {
                    ...state,
                    items: state.items.map((item) => {
                        const price = prices[cartLineKey(item)];
                        return typeof price === 'number' ? { ...item, price } : item;
                    }),
                };
            }

            case 'CLEAR_CART':
                return { ...state, items: [] };

            default:
                return state;
        }
    }

    const newState = execute();
    const keycloakService = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService);
    // @ts-ignore Keycloak возвращает email TODO
    if (keycloakService.keycloak.tokenParsed?.email) {
        // @ts-ignore Keycloak возвращает email TODO
        syncCartWithServer(keycloakService.keycloak.tokenParsed.email, newState);
    }
    return newState
};