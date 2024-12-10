// src/context/CartContext.tsx
import React, {createContext, useContext, useEffect, useReducer} from 'react';
import {CartAction, initialState, CartState, cartReducer, Product} from '../reducers/cart-reducer';
import container from "../inversify.config";
import type {IApiClient} from "../iterfaces/i-api-client";
import IDENTIFIERS from "../constants/identifiers";
import {IKeycloakService} from "../iterfaces/i-keycloak-service";

const CartContext = createContext<{
    state: CartState;
    dispatch: React.Dispatch<CartAction>;
    syncCartWithServer: (userId: string) => Promise<void>;
}>({
    state: initialState,
    dispatch: () => null,
    syncCartWithServer: async () => {
    },
});

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({children}) => {
    const [state, dispatch] = useReducer(cartReducer, initialState, (initial) => {
        const storedCart = localStorage.getItem('cart');
        return storedCart ? JSON.parse(storedCart) : initial;
    });

    useEffect(() => {
        localStorage.setItem('cart', JSON.stringify(state));
        const keycloakService = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService);
        keycloakService.stateChangedEmitter.off('onAuthSuccess');
        keycloakService.stateChangedEmitter.on('onAuthSuccess', async () => {
            // @ts-ignore Keycloak содержит
            await syncCartWithServer(keycloakService.keycloak.tokenParsed.email);
        });
    }, [state]);

    // Функция объединения двух корзин
    const mergeCarts = (localCart: Product[], serverCart: { userId: string, cartGames: Product[]}) => {
        const mergedCart: Product[] = [...serverCart.cartGames];

        localCart.forEach((localItem) => {
            const existingItem = mergedCart.find((item) => item.gameId === localItem.gameId);
            if (existingItem) {
                existingItem.quantity = localItem.quantity;
            } else {
                mergedCart.push(localItem);
            }
        });

        return mergedCart;
    };

    // Функция синхронизации корзины с сервером
    const syncCartWithServer = async (userId: string) => {
        try {
            const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);

            // Получаем корзину с сервера
            const response = await apiClient.api.get(`/api/cart/${userId}`);
            const serverCart: { userId: string, cartGames: Product[]} = response.data;


            // Сливаем локальную корзину и серверную
            const mergedCart = serverCart?.cartGames != null ? mergeCarts(state.items, serverCart) : state.items;

            // Отправляем объединённую корзину на сервер
            await apiClient.api.post(`/api/cart/${userId}`, {
                userId: userId,
                cartGames: [...mergedCart.map(product => ({
                    gameId: product.gameId,
                    name: product.name,
                    price: product.price,
                    quantity: product.quantity,
                    image: product.image
                }))]
            });

            // Устанавливаем итоговую корзину в состояние
            dispatch({type: 'SET_CART', payload: mergedCart});

            // Очищаем локальную корзину
            localStorage.removeItem('cart');
        } catch (error) {
            console.error('Failed to sync cart with server:', error);
        }
    };

    return (
        <CartContext.Provider value={{state, dispatch, syncCartWithServer}}>
            {children}
        </CartContext.Provider>
    );
};


export const useCart = () => useContext(CartContext);