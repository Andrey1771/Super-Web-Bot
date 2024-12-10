import IDENTIFIERS from "../constants/identifiers";
import container from "../inversify.config";
import { IApiClient } from "../iterfaces/i-api-client";
import {IKeycloakService} from "../iterfaces/i-keycloak-service";

export interface Product {
    gameId: string;
    name: string;
    price: number;
    quantity: number;
    image: string;
}

export interface CartState {
    items: Product[];
}

export type CartAction =
    | { type: 'ADD_TO_CART'; payload: Product }
    | { type: 'REMOVE_FROM_CART'; payload: string }
    | { type: 'INCREASE_QUANTITY'; payload: string }
    | { type: 'DECREASE_QUANTITY'; payload: string }
    | { type: 'SET_CART'; payload: Product[] }
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
                image: product.image
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
                const existingItem = state.items.find((item) => item.gameId === action.payload.gameId);
                if (existingItem) {
                    return {
                        ...state,
                        items: state.items.map((item) =>
                            item.gameId === action.payload.gameId
                                ? { ...item, quantity: item.quantity + 1 }
                                : item
                        ),
                    };
                }
                return { ...state, items: [...state.items, { ...action.payload, quantity: 1 }] };

            case 'REMOVE_FROM_CART':
                return {
                    ...state,
                    items: state.items.filter((item) => item.gameId !== action.payload),
                };

            case 'INCREASE_QUANTITY':
                return {
                    ...state,
                    items: state.items.map((item) =>
                        item.gameId === action.payload
                            ? { ...item, quantity: item.quantity + 1 }
                            : item
                    ),
                };

            case 'DECREASE_QUANTITY':
                return {
                    ...state,
                    items: state.items
                        .map((item) =>
                            item.gameId === action.payload && item.quantity > 1
                                ? { ...item, quantity: item.quantity - 1 }
                                : item
                        )
                        .filter((item) => item.quantity > 0), // Удаляем товары с количеством 0
                };

            case 'SET_CART':
                return { ...state, items: action.payload };

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