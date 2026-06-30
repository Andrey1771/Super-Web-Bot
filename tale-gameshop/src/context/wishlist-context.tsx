import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import container from '../inversify.config';
import IDENTIFIERS from '../constants/identifiers';
import type { IWishlistService } from '../iterfaces/i-wishlist-service';
import type { IKeycloakService } from '../iterfaces/i-keycloak-service';

// Единый источник правды для списка желаемого (wishlist) на весь сайт:
// каталог, карточка игры, Saved items и счётчики читают одно и то же состояние.
// Гость хранит выбор в localStorage; при входе гостевой список сливается с серверным.

const GUEST_KEY = 'wishlist_guest';
const LEGACY_KEY = 'wishlist';

const readGuestWishlist = (): string[] => {
    const storedGuest = localStorage.getItem(GUEST_KEY);
    if (storedGuest) {
        try {
            return (JSON.parse(storedGuest) as string[]).filter(Boolean);
        } catch (error) {
            console.error('Failed to parse guest wishlist from storage:', error);
            return [];
        }
    }

    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) {
        return [];
    }

    try {
        const parsed = (JSON.parse(legacy) as string[]).filter(Boolean);
        localStorage.setItem(GUEST_KEY, JSON.stringify(parsed));
        localStorage.removeItem(LEGACY_KEY);
        return parsed;
    } catch (error) {
        console.error('Failed to parse legacy wishlist from storage:', error);
        localStorage.removeItem(LEGACY_KEY);
        return [];
    }
};

const writeGuestWishlist = (ids: Set<string>) => {
    localStorage.setItem(GUEST_KEY, JSON.stringify(Array.from(ids)));
};

const getUserIdentifier = (keycloakService: IKeycloakService) => {
    const parsedToken = keycloakService.keycloak?.tokenParsed as
        | { email?: string; preferred_username?: string; sub?: string }
        | undefined;
    return parsedToken?.email ?? parsedToken?.preferred_username ?? parsedToken?.sub ?? '';
};

type WishlistContextValue = {
    ids: Set<string>;
    count: number;
    isLoading: boolean;
    error: string | null;
    isWishlisted: (gameId?: string | null) => boolean;
    toggle: (gameId?: string | null) => Promise<void>;
    add: (gameId?: string | null) => Promise<void>;
    remove: (gameId?: string | null) => Promise<void>;
    reload: () => Promise<void>;
};

const noop = async () => {};

const WishlistContext = createContext<WishlistContextValue>({
    ids: new Set(),
    count: 0,
    isLoading: false,
    error: null,
    isWishlisted: () => false,
    toggle: noop,
    add: noop,
    remove: noop,
    reload: noop
});

export const WishlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { wishlistService, keycloakService } = useMemo(
        () => ({
            wishlistService: container.get<IWishlistService>(IDENTIFIERS.IWishlistService),
            keycloakService: container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService)
        }),
        []
    );

    const [ids, setIds] = useState<Set<string>>(() => new Set(readGuestWishlist()));
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const idsRef = useRef<Set<string>>(ids);
    const userIdRef = useRef('');

    const commit = useCallback((next: Set<string>) => {
        idsRef.current = next;
        setIds(next);
    }, []);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        const userId = getUserIdentifier(keycloakService);
        userIdRef.current = userId;
        const guestIds = readGuestWishlist();
        try {
            if (!userId) {
                commit(new Set(guestIds));
                return;
            }
            // При входе: сливаем гостевой выбор с серверным, иначе просто читаем серверный.
            if (guestIds.length > 0) {
                const mergedIds = await wishlistService.merge(guestIds);
                commit(new Set(mergedIds));
                localStorage.removeItem(GUEST_KEY);
            } else {
                const serverIds = await wishlistService.getWishlist();
                commit(new Set(serverIds));
            }
        } catch (err) {
            console.error('Failed to load wishlist:', err);
            setError('Unable to load wishlist.');
            commit(new Set(guestIds));
        } finally {
            setIsLoading(false);
        }
    }, [commit, keycloakService, wishlistService]);

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

    const isWishlisted = useCallback((gameId?: string | null) => Boolean(gameId) && ids.has(gameId as string), [ids]);

    const toggle = useCallback(
        async (gameId?: string | null) => {
            if (!gameId) {
                return;
            }
            const userId = userIdRef.current;
            const wasWishlisted = idsRef.current.has(gameId);

            // Оптимистично обновляем состояние сразу — UI откликается мгновенно везде.
            const next = new Set(idsRef.current);
            if (wasWishlisted) {
                next.delete(gameId);
            } else {
                next.add(gameId);
            }
            commit(next);

            if (!userId) {
                writeGuestWishlist(next);
                return;
            }

            try {
                if (wasWishlisted) {
                    await wishlistService.removeItem(gameId);
                } else {
                    await wishlistService.addItem(gameId);
                }
            } catch (err) {
                console.error('Failed to update wishlist:', err);
                // Откат при ошибке сети/сервера.
                const rollback = new Set(idsRef.current);
                if (wasWishlisted) {
                    rollback.add(gameId);
                } else {
                    rollback.delete(gameId);
                }
                commit(rollback);
            }
        },
        [commit, wishlistService]
    );

    const add = useCallback(
        async (gameId?: string | null) => {
            if (gameId && !idsRef.current.has(gameId)) {
                await toggle(gameId);
            }
        },
        [toggle]
    );

    const remove = useCallback(
        async (gameId?: string | null) => {
            if (gameId && idsRef.current.has(gameId)) {
                await toggle(gameId);
            }
        },
        [toggle]
    );

    const value = useMemo<WishlistContextValue>(
        () => ({
            ids,
            count: ids.size,
            isLoading,
            error,
            isWishlisted,
            toggle,
            add,
            remove,
            reload: load
        }),
        [ids, isLoading, error, isWishlisted, toggle, add, remove, load]
    );

    return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
};

export const useWishlist = () => useContext(WishlistContext);
