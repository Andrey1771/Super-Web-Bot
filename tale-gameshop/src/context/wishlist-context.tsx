import React, {createContext, useContext, useEffect, useReducer} from 'react';
import container from '../inversify.config';
import type {IApiClient} from '../iterfaces/i-api-client';
import IDENTIFIERS from '../constants/identifiers';
import {IKeycloakService} from '../iterfaces/i-keycloak-service';

export interface WishlistItem {
    gameId: string;
    name: string;
    price: number;
    image: string;
}

interface WishlistState {
    items: WishlistItem[];
}

type WishlistAction =
    | { type: 'SET_WISHLIST'; payload: WishlistItem[] }
    | { type: 'ADD_ITEM'; payload: WishlistItem }
    | { type: 'REMOVE_ITEM'; payload: string }
    | { type: 'CLEAR' };

const initialState: WishlistState = {
    items: []
};

const wishlistReducer = (state: WishlistState, action: WishlistAction): WishlistState => {
    switch (action.type) {
        case 'SET_WISHLIST':
            return {items: action.payload};
        case 'ADD_ITEM':
            if (state.items.some((item) => item.gameId === action.payload.gameId)) {
                return state;
            }
            return {items: [...state.items, action.payload]};
        case 'REMOVE_ITEM':
            return {items: state.items.filter((item) => item.gameId !== action.payload)};
        case 'CLEAR':
            return {items: []};
        default:
            return state;
    }
};

const WishlistContext = createContext<{
    state: WishlistState;
    dispatch: React.Dispatch<WishlistAction>;
    toggleWishlist: (item: WishlistItem) => void;
    removeFromWishlist: (gameId: string) => void;
    clearWishlist: () => void;
}>(
    {
        state: initialState,
        dispatch: () => null,
        toggleWishlist: () => {},
        removeFromWishlist: () => {},
        clearWishlist: () => {}
    }
);

export const WishlistProvider: React.FC<{ children: React.ReactNode }> = ({children}) => {
    const [state, dispatch] = useReducer(wishlistReducer, initialState, (initial) => {
        const storedWishlist = localStorage.getItem('wishlist');
        return storedWishlist ? {items: JSON.parse(storedWishlist)} : initial;
    });

    const syncWishlistWithServer = async (userId: string) => {
        try {
            const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
            const response = await apiClient.api.get(`/api/wishlist/${userId}`);
            const serverWishlist: { userId: string; wishlistGames: WishlistItem[] } | null = response.data;

            const mergedWishlist = serverWishlist?.wishlistGames
                ? mergeWishlists(state.items, serverWishlist)
                : state.items;

            await apiClient.api.post(`/api/wishlist/${userId}`, {
                userId: userId,
                wishlistGames: mergedWishlist.map((item) => ({
                    gameId: item.gameId,
                    name: item.name,
                    price: item.price,
                    image: item.image
                }))
            });

            dispatch({type: 'SET_WISHLIST', payload: mergedWishlist});
            localStorage.removeItem('wishlist');
        } catch (error) {
            console.error('Failed to sync wishlist with server:', error);
        }
    };

    const mergeWishlists = (localWishlist: WishlistItem[], serverWishlist: { userId: string; wishlistGames: WishlistItem[] }) => {
        const mergedWishlist = [...serverWishlist.wishlistGames];

        localWishlist.forEach((localItem) => {
            const existingItem = mergedWishlist.find((item) => item.gameId === localItem.gameId);
            if (!existingItem) {
                mergedWishlist.push(localItem);
            }
        });

        return mergedWishlist;
    };

    useEffect(() => {
        localStorage.setItem('wishlist', JSON.stringify(state.items));
    }, [state.items]);

    useEffect(() => {
        const keycloakService = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService);
        const syncIfAuthenticated = async () => {
            if (keycloakService.keycloak.authenticated) {
                // @ts-ignore Keycloak содержит email
                await syncWishlistWithServer(keycloakService.keycloak.tokenParsed.email);
            }
        };

        keycloakService.stateChangedEmitter.off('onAuthSuccess');
        keycloakService.stateChangedEmitter.on('onAuthSuccess', syncIfAuthenticated);

        if (keycloakService.keycloak.authenticated) {
            syncIfAuthenticated();
        }
    }, []);

    const updateWishlistOnServer = async (nextItems: WishlistItem[]) => {
        const keycloakService = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService);
        if (!keycloakService.keycloak.authenticated) {
            return;
        }
        try {
            const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
            // @ts-ignore Keycloak содержит email
            const userId = keycloakService.keycloak.tokenParsed.email;
            await apiClient.api.post(`/api/wishlist/${userId}`, {
                userId: userId,
                wishlistGames: nextItems.map((item) => ({
                    gameId: item.gameId,
                    name: item.name,
                    price: item.price,
                    image: item.image
                }))
            });
        } catch (error) {
            console.error('Failed to update wishlist on server:', error);
        }
    };

    const toggleWishlist = (item: WishlistItem) => {
        const exists = state.items.some((wishlistItem) => wishlistItem.gameId === item.gameId);
        const nextItems = exists
            ? state.items.filter((wishlistItem) => wishlistItem.gameId !== item.gameId)
            : [...state.items, item];

        dispatch({type: 'SET_WISHLIST', payload: nextItems});
        updateWishlistOnServer(nextItems);
    };

    const removeFromWishlist = (gameId: string) => {
        const nextItems = state.items.filter((item) => item.gameId !== gameId);
        dispatch({type: 'SET_WISHLIST', payload: nextItems});
        updateWishlistOnServer(nextItems);
    };

    const clearWishlist = () => {
        dispatch({type: 'CLEAR'});
        updateWishlistOnServer([]);
    };

    return (
        <WishlistContext.Provider value={{state, dispatch, toggleWishlist, removeFromWishlist, clearWishlist}}>
            {children}
        </WishlistContext.Provider>
    );
};

export const useWishlist = () => useContext(WishlistContext);
