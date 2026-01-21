import {useCallback, useEffect, useState} from 'react';
import container from '../inversify.config';
import IDENTIFIERS from '../constants/identifiers';
import type {IRecommendationsService} from '../iterfaces/i-recommendations-service';
import type {RecommendationItem} from '../models/recommendations';
import type {IKeycloakService} from '../iterfaces/i-keycloak-service';

export const useRecommendations = (limit = 8) => {
    const recommendationsService = container.get<IRecommendationsService>(IDENTIFIERS.IRecommendationsService);
    const keycloakService = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService);
    const [items, setItems] = useState<RecommendationItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!keycloakService.keycloak.authenticated) {
            setItems([]);
            setIsLoading(false);
            setError('Sign in to see recommendations.');
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const data = await recommendationsService.getRecommendations(limit);
            setItems(data);
        } catch (err) {
            console.error('Failed to load recommendations:', err);
            setError('Unable to load recommendations.');
        } finally {
            setIsLoading(false);
        }
    }, [keycloakService, limit, recommendationsService]);

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
