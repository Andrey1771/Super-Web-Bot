import { useCallback, useEffect, useRef, useState } from 'react';
import container from '../inversify.config';
import IDENTIFIERS from '../constants/identifiers';
import type { IWishlistService } from '../iterfaces/i-wishlist-service';
import type { IKeycloakService } from '../iterfaces/i-keycloak-service';

const WISHLIST_GUEST_KEY = 'wishlist_guest';
const WISHLIST_LEGACY_KEY = 'wishlist';

const readGuestWishlist = () => {
    const storedGuest = localStorage.getItem(WISHLIST_GUEST_KEY);
    if (storedGuest) {
        try {
            return (JSON.parse(storedGuest) as string[]).filter(Boolean);
        } catch (error) {
            console.error('Failed to parse guest wishlist from storage:', error);
            return [];
        }
    }

    const legacy = localStorage.getItem(WISHLIST_LEGACY_KEY);
    if (!legacy) {
        return [];
    }

    try {
        const parsed = (JSON.parse(legacy) as string[]).filter(Boolean);
        localStorage.setItem(WISHLIST_GUEST_KEY, JSON.stringify(parsed));
        localStorage.removeItem(WISHLIST_LEGACY_KEY);
        return parsed;
    } catch (error) {
        console.error('Failed to parse legacy wishlist from storage:', error);
        localStorage.removeItem(WISHLIST_LEGACY_KEY);
        return [];
    }
};

const getUserIdentifier = (keycloakService: IKeycloakService) => {
    const parsedToken = keycloakService.keycloak?.tokenParsed as
        | { email?: string; preferred_username?: string; sub?: string }
        | undefined;
    return parsedToken?.email ?? parsedToken?.preferred_username ?? parsedToken?.sub ?? '';
};

export const useWishlistSummary = () => {
    const wishlistService = container.get<IWishlistService>(IDENTIFIERS.IWishlistService);
    const keycloakService = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService);
    const [count, setCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const userIdRef = useRef('');

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        const userId = getUserIdentifier(keycloakService);
        userIdRef.current = userId;
        try {
            if (userId) {
                const data = await wishlistService.getWishlist();
                setCount(data.length);
            } else {
                const guestIds = readGuestWishlist();
                setCount(guestIds.length);
            }
        } catch (err) {
            console.error('Failed to load wishlist summary:', err);
            setError('Unable to load wishlist.');
            setCount(0);
        } finally {
            setIsLoading(false);
        }
    }, [keycloakService, wishlistService]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        const handleAuth = () => {
            const userId = getUserIdentifier(keycloakService);
            if (userId !== userIdRef.current) {
                load();
            }
        };
        keycloakService.stateChangedEmitter.on('onAuthSuccess', handleAuth);
        return () => {
            keycloakService.stateChangedEmitter.off('onAuthSuccess', handleAuth);
        };
    }, [keycloakService, load]);

    return {
        count,
        isLoading,
        error,
        reload: load
    };
};
