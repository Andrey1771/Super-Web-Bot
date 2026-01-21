import {useCallback, useEffect, useState} from 'react';
import container from '../inversify.config';
import IDENTIFIERS from '../constants/identifiers';
import type {IGameKeysService} from '../iterfaces/i-game-keys-service';
import type {GameKey} from '../models/game-key';
import type {IKeycloakService} from '../iterfaces/i-keycloak-service';

export const useGameKeys = (limit = 20) => {
    const gameKeysService = container.get<IGameKeysService>(IDENTIFIERS.IGameKeysService);
    const keycloakService = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService);
    const [items, setItems] = useState<GameKey[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!keycloakService.keycloak.authenticated) {
            setItems([]);
            setIsLoading(false);
            setError('Sign in to view your keys.');
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const data = await gameKeysService.getKeys(limit);
            setItems(data);
        } catch (err) {
            console.error('Failed to load game keys:', err);
            setError('Unable to load keys.');
        } finally {
            setIsLoading(false);
        }
    }, [gameKeysService, keycloakService, limit]);

    useEffect(() => {
        load();
    }, [load]);

    return {
        items,
        isLoading,
        error,
        reload: load
    };
};
