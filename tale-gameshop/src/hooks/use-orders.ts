import { useCallback, useEffect, useState } from 'react';
import container from '../inversify.config';
import IDENTIFIERS from '../constants/identifiers';
import type { IOrdersService } from '../iterfaces/i-orders-service';
import type { IKeycloakService } from '../iterfaces/i-keycloak-service';
import type { Order } from '../models/order';

const getUserIdentifier = (keycloakService: IKeycloakService) => {
    const parsedToken = keycloakService.keycloak?.tokenParsed as
        | { email?: string; preferred_username?: string; sub?: string }
        | undefined;
    return parsedToken?.email ?? parsedToken?.preferred_username ?? parsedToken?.sub ?? '';
};

export const useOrders = (limit: number | null = 3) => {
    const ordersService = container.get<IOrdersService>(IDENTIFIERS.IOrdersService);
    const keycloakService = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService);
    const [items, setItems] = useState<Order[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await ordersService.getOrders();
            const userId = getUserIdentifier(keycloakService);
            const filtered = userId ? data.filter((order) => order.userName === userId) : data;
            const sorted = [...filtered].sort((a, b) => {
                const dateA = new Date(a.orderDate).getTime();
                const dateB = new Date(b.orderDate).getTime();
                return dateB - dateA;
            });
            setTotalCount(filtered.length);
            setItems(limit === null ? sorted : sorted.slice(0, limit));
        } catch (err) {
            console.error('Failed to load orders:', err);
            setError('Unable to load orders.');
        } finally {
            setIsLoading(false);
        }
    }, [keycloakService, limit, ordersService]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        const handleAuth = () => {
            load();
        };
        keycloakService.stateChangedEmitter.on('onAuthSuccess', handleAuth);
        return () => {
            keycloakService.stateChangedEmitter.off('onAuthSuccess', handleAuth);
        };
    }, [keycloakService, load]);

    return {
        items,
        totalCount,
        isLoading,
        error,
        reload: load
    };
};
