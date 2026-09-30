// src/context/CartContext.tsx
import React, {createContext, useContext, useEffect, useMemo, useReducer} from 'react';
import {CartAction, initialState, CartState, cartReducer, cartLineKey, Product} from '../reducers/cart-reducer';
import {analyticsClient} from "../utils/analytics-client";
import {trackFunnelStep} from "../utils/funnel-tracking";
import {gaItemVariant} from "../utils/item-list-tracking";
import {useSitePreferences} from "../context/site-preferences";
import container from "../inversify.config";
import type {IApiClient} from "../iterfaces/i-api-client";
import IDENTIFIERS from "../constants/identifiers";
import {IKeycloakService} from "../iterfaces/i-keycloak-service";
import {flyToCart} from "../components/cart/cart-flight";

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
    const {currency: preferredCurrency} = useSitePreferences();
    const [state, dispatch] = useReducer(cartReducer, initialState, (initial) => {
        const storedCart = localStorage.getItem('cart');
        return storedCart ? JSON.parse(storedCart) : initial;
    });

    useEffect(() => {
        localStorage.setItem('cart', JSON.stringify(state));
        const keycloakService = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService);
        const handleAuthSuccess = async () => {
            const isAdminRoute = window.location.pathname.startsWith('/admin');
            if (isAdminRoute) {
                return;
            }
            // @ts-ignore Keycloak содержит
            await syncCartWithServer(keycloakService.keycloak.tokenParsed.email);
        };

        keycloakService.stateChangedEmitter.off('onAuthSuccess', handleAuthSuccess);
        keycloakService.stateChangedEmitter.on('onAuthSuccess', handleAuthSuccess);

        return () => {
            keycloakService.stateChangedEmitter.off('onAuthSuccess', handleAuthSuccess);
        };
    }, [state]);

    // Функция объединения двух корзин
    const mergeCarts = (localCart: Product[], serverCart: { userId: string, cartGames: Product[]}) => {
        const mergedCart: Product[] = [...serverCart.cartGames];

        localCart.forEach((localItem) => {
            // Сравниваем по ключу позиции, а не по игре: Standard и Deluxe, европейский и
            // глобальный ключ — разные товары с разной ценой. По gameId они схлопывались в одну
            // строку, и покупатель терял то, что выбрал, просто войдя в аккаунт.
            const existingItem = mergedCart.find((item) => cartLineKey(item) === cartLineKey(localItem));
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
        if (!userId || window.location.pathname.startsWith('/admin')) {
            return;
        }
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
                    image: product.image,
                    editionCode: product.editionCode,
                    editionTitle: product.editionTitle,
                    offerKey: product.offerKey,
                    offerTitle: product.offerTitle
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

    /**
     * Добавление в корзину считается здесь, а не на кнопках.
     *
     * Кнопок «в корзину» в магазине девять — каталог, карточка, страница игры, DLC, подборки,
     * рекомендации, кабинет, избранное, — а событие раньше уходило только из трёх. Остальные
     * шесть добавлений не видел ни Google, ни собственная воронка: корзина росла, а по отчётам
     * в неё почти не клали. Считать в одном месте — единственный способ, чтобы следующая
     * добавленная кнопка не создала ту же дыру заново.
     */
    const trackedDispatch = useMemo<React.Dispatch<CartAction>>(() => (action: CartAction) => {
        if (action.type === 'REMOVE_FROM_CART') {
            // Позицию ищем ДО удаления: после него о ней уже нечего рассказать. Удаление —
            // самый прямой сигнал, что цена или состав не устроили, и терять его нельзя.
            const removed = state.items.find((candidate) => cartLineKey(candidate) === action.payload);
            if (removed) {
                const quantity = removed.quantity > 0 ? removed.quantity : 1;
                analyticsClient.trackEcommerce('remove_from_cart', {
                    currency: state.currency ?? preferredCurrency,
                    value: removed.price * quantity,
                    items: [{
                        item_id: removed.gameId,
                        item_name: removed.name,
                        price: removed.price,
                        quantity,
                        ...(removed.category ? { item_category: removed.category } : {}),
                        ...(gaItemVariant(removed) ? { item_variant: gaItemVariant(removed) } : {}),
                    }],
                });
            }
        }

        if (action.type === 'ADD_TO_CART') {
            const item = action.payload;
            // Валюта корзины, а не догадка: цены позиций посчитаны сервером именно в ней.
            const currency = state.currency ?? preferredCurrency;
            const quantity = item.quantity > 0 ? item.quantity : 1;

            // Обложка летит к иконке корзины: от кнопки, которую нажали (она в фокусе), или от явно переданной карточки.
            flyToCart({ origin: action.meta?.origin ?? document.activeElement, label: item.name });

            trackFunnelStep("add_to_cart", item.gameId);
            analyticsClient.trackEcommerce('add_to_cart', {
                currency,
                value: item.price * quantity,
                items: [{
                    item_id: item.gameId,
                    item_name: item.name,
                    price: item.price,
                    quantity,
                    ...(item.category ? { item_category: item.category } : {}),
                    ...(gaItemVariant(item) ? { item_variant: gaItemVariant(item) } : {}),
                }],
            });
        }

        dispatch(action);
    }, [dispatch, state.currency, state.items, preferredCurrency]);

    return (
        <CartContext.Provider value={{state, dispatch: trackedDispatch, syncCartWithServer}}>
            {children}
        </CartContext.Provider>
    );
};


export const useCart = () => useContext(CartContext);
