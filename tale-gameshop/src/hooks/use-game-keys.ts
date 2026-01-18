import { useCallback, useEffect, useState } from 'react';
import container from '../inversify.config';
import IDENTIFIERS from '../constants/identifiers';
import type { IGameKeysService } from '../iterfaces/i-game-keys-service';
import type { GameKey } from '../models/game-key';

export const useGameKeys = (limit = 20) => {
    const gameKeysService = container.get<IGameKeysService>(IDENTIFIERS.IGameKeysService);
    const [items, setItems] = useState<GameKey[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
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
    }, [gameKeysService, limit]);

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
