import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPaymentMethods } from '../api/billing-api';
import container from '../inversify.config';
import IDENTIFIERS from '../constants/identifiers';
import type { IKeycloakService } from '../iterfaces/i-keycloak-service';

const getUserIdentifier = (keycloakService: IKeycloakService) => {
    const parsedToken = keycloakService.keycloak?.tokenParsed as
        | { email?: string; preferred_username?: string; sub?: string }
        | undefined;
    return parsedToken?.email ?? parsedToken?.preferred_username ?? parsedToken?.sub ?? '';
};

export const usePaymentMethodsSummary = () => {
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
            const methods = await fetchPaymentMethods();
            setCount(methods.length);
        } catch (err) {
            console.error('Failed to load payment methods summary:', err);
            setError('Unable to load payment methods.');
            setCount(0);
        } finally {
            setIsLoading(false);
        }
    }, [keycloakService]);

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
