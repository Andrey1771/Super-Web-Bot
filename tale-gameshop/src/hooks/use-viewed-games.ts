import { useCallback, useEffect, useState } from 'react';
import container from '../inversify.config';
import IDENTIFIERS from '../constants/identifiers';
import type { IRecommendationsService } from '../iterfaces/i-recommendations-service';
import type { ViewedGameItem } from '../models/recommendations';

export const useViewedGames = (limit = 8) => {
    const recommendationsService = container.get<IRecommendationsService>(IDENTIFIERS.IRecommendationsService);
    const [items, setItems] = useState<ViewedGameItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await recommendationsService.getViewed(limit);
            setItems(data);
        } catch (err) {
            console.error('Failed to load viewed history:', err);
            setError('Unable to load recently viewed.');
        } finally {
            setIsLoading(false);
        }
    }, [limit, recommendationsService]);

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
